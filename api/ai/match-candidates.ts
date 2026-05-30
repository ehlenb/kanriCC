import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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
      .select("title, jd_text, salary_min, salary_max")
      .eq("id", requisition_id)
      .single(),
    supabase
      .from("requisition_conditions")
      .select("condition_text, condition_type, priority_rank")
      .eq("requisition_id", requisition_id)
      .order("priority_rank"),
    supabase
      .from("processes")
      .select("candidate_id")
      .eq("requisition_id", requisition_id),
  ]);

  if (!requisition) return res.status(404).json({ error: "Requisition not found" });

  const existingCandidateIds = new Set(
    (existingProcesses ?? []).map((p: { candidate_id: string }) => p.candidate_id),
  );

  const { data: candidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, japanese_level, english_level, expected_total_min, expected_total_max, ai_context, candidate_status, last_interaction_at",
    )
    .eq("recruiter_id", recruiter_id)
    .in("candidate_status", ["active", "passive"]);

  const eligibleCandidates = (candidates ?? []).filter(
    (c: { id: string }) => !existingCandidateIds.has(c.id),
  );

  if (eligibleCandidates.length === 0) {
    return res.status(200).json({ matches: [] });
  }

  const r = requisition as {
    title: string;
    jd_text: string | null;
    salary_min: number | null;
    salary_max: number | null;
  };

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const mustHaveConditions = (conditions ?? [])
    .filter((c: { condition_type: string }) => c.condition_type === "must_have")
    .map((c: { priority_rank: number; condition_text: string }) => `${c.priority_rank}. ${c.condition_text}`)
    .join("\n");

  const niceToHaveConditions = (conditions ?? [])
    .filter((c: { condition_type: string }) => c.condition_type === "nice_to_have")
    .map((c: { condition_text: string }) => `- ${c.condition_text}`)
    .join("\n");

  const candidatesSummary = eligibleCandidates.slice(0, 50).map((c: {
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
  }) => {
    const salaryStretch = r.salary_max && c.expected_total_min && c.expected_total_min > r.salary_max;
    return `ID:${c.id}
Name: ${c.full_name} (${c.candidate_status})
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"} / English ${c.english_level ?? "—"}
Expected salary: ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}${salaryStretch ? " [SALARY STRETCH]" : ""}
${c.ai_context ? `Intelligence: ${c.ai_context.slice(0, 300)}` : ""}`;
  }).join("\n\n---\n\n");

  const prompt = `
ROLE: ${r.title}
Salary range: ${formatYen(r.salary_min)}–${formatYen(r.salary_max)}

Must-have conditions (primary filter — language must meet requirement, this is a hard filter in Japan):
${mustHaveConditions || "None extracted."}

Nice-to-have conditions (secondary consideration):
${niceToHaveConditions || "None."}

${r.jd_text ? `JD context:\n${r.jd_text.slice(0, 800)}` : ""}

CANDIDATES TO RANK:
${candidatesSummary}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    system: `You are ranking candidates for an open role at a foreign company in Japan.

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

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { matches: unknown[] };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
