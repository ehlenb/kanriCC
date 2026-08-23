import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import { retrieveCandidateIds } from "./lib/candidate-retrieval.js";
import { extractJson } from "./lib/parse-json-response.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { requisition_id, recruiter_id } = req.body as {
    requisition_id: string;
    recruiter_id: string;
  };

  if (!requisition_id || !recruiter_id) {
    return res.status(400).json({ error: "requisition_id and recruiter_id are required" });
  }

  const [{ data: requisition }, { data: conditions }, { data: existingProcesses }] = await Promise.all([
    supabase
      .from("requisitions")
      .select("team_id, title, jd_text, strategic_context, salary_min, salary_max")
      .eq("id", requisition_id)
      .single(),
    supabase
      .from("requisition_conditions")
      .select("condition_text, condition_type, priority_rank, weight")
      .eq("requisition_id", requisition_id)
      .order("priority_rank"),
    supabase
      .from("processes")
      .select("candidate_id")
      .eq("requisition_id", requisition_id),
  ]);

  if (!requisition) return res.status(404).json({ error: "Requisition not found" });

  const r = requisition as {
    team_id: string;
    title: string;
    jd_text: string | null;
    strategic_context: string | null;
    salary_min: number | null;
    salary_max: number | null;
  };

  const existingCandidateIds = new Set(
    (existingProcesses ?? []).map((p: { candidate_id: string }) => p.candidate_id),
  );

  const conditionRows = (conditions ?? []) as { condition_text: string; condition_type: string; priority_rank: number; weight: number }[];

  // Stage 1 — retrieve. Team-scoped (not owner-scoped -- teammates' candidates
  // must be visible per CLAUDE.md's multi-user model, which the old
  // recruiter_id-filtered fetch here did not respect).
  const candidateIds = await retrieveCandidateIds({
    teamId: r.team_id,
    title: r.title,
    jdText: r.jd_text,
    strategicContext: r.strategic_context,
    conditions: conditionRows,
    statuses: ["active", "passive"],
    excludedIds: [...existingCandidateIds],
    limit: 60,
  });

  if (candidateIds.length === 0) {
    return res.status(200).json({ matches: [] });
  }

  type CandidateRecord = {
    id: string;
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    japanese_level: string | null;
    english_level: string | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    ai_context: string | null;
    candidate_status: string;
    last_interaction_at: string | null;
  };

  const { data: retrieved } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, japanese_level, english_level, expected_total_min, expected_total_max, ai_context, candidate_status, last_interaction_at",
    )
    .in("id", candidateIds);

  const rankById = new Map(candidateIds.map((id, i) => [id, i]));
  const eligibleCandidates = ((retrieved ?? []) as CandidateRecord[]).sort(
    (a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0),
  );

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const dealbreakerConditions = conditionRows
    .filter((c) => c.condition_type === "dealbreaker")
    .map((c) => `${c.condition_text} (importance: ${c.weight}/10)`)
    .join("\n");

  const mustHaveConditions = conditionRows
    .filter((c) => c.condition_type === "must_have")
    .map((c) => `${c.priority_rank}. ${c.condition_text} (importance: ${c.weight}/10)`)
    .join("\n");

  const niceToHaveConditions = conditionRows
    .filter((c) => c.condition_type === "nice_to_have")
    .map((c) => `- ${c.condition_text} (importance: ${c.weight}/10)`)
    .join("\n");

  const candidatesSummary = eligibleCandidates.slice(0, 50).map((c: CandidateRecord) => {
    const salaryStretch = r.salary_max && c.expected_total_min && c.expected_total_min > r.salary_max;
    return `ID:${c.id}
Name: ${c.full_name} (${c.candidate_status})
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Expected salary: ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}${salaryStretch ? " [SALARY STRETCH]" : ""}
${c.ai_context ? `Intelligence: ${c.ai_context}` : ""}`;
  }).join("\n\n---\n\n");

  const prompt = `
ROLE: ${r.title}
Salary range: ${formatYen(r.salary_min)}–${formatYen(r.salary_max)}

Dealbreakers (hard exclude — a candidate who clearly fails one should score no higher than 2):
${dealbreakerConditions || "None."}

Must-have conditions (primary filter — language must meet requirement, this is a hard filter in Japan):
${mustHaveConditions || "None extracted."}

Nice-to-have conditions (secondary consideration):
${niceToHaveConditions || "None."}

${r.jd_text ? `JD context:\n${r.jd_text.slice(0, 800)}` : ""}

CANDIDATES TO RANK (already relevance-ordered — earlier candidates are a stronger retrieval match):
${candidatesSummary}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 6000,
    thinking: { type: "disabled" },
    system: `You are ranking candidates for an open role at a foreign company in Japan.

Dealbreakers are a hard exclude — a candidate who clearly fails one should score no higher than 2. Use higher-importance conditions to break ties among otherwise-similar candidates.
Focus on must-have conditions. Language levels must meet the requirement — this is a hard filter in the Japan bilingual market.
Salary: if candidate expected_total_min > role salary_max, flag as salary stretch but still include if fit is strong.
Score each candidate 1-10. Return maximum 20 candidates, ranked highest score first.
Be specific in match reasons — reference the actual conditions and candidate background.

Return valid JSON only — no markdown fences, no explanation:
{
  "matches": [
    {
      "candidate_id": string,
      "candidate_name": string,
      "score": number,
      "match_reason": string,
      "is_salary_stretch": boolean,
      "current_title": string | null,
      "current_company": string | null,
      "japanese_level": string | null,
      "expected_total_min": number | null
    }
  ]
}`,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content.find((b) => b.type === "text")?.text.trim() ?? "{}";
  const cleaned = extractJson(raw);

  try {
    const parsed = JSON.parse(cleaned) as { matches: unknown[] };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
