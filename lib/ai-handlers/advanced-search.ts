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

  const { requisition_id, client_id, threshold = 45, use_key_criteria = false } = req.body as {
    requisition_id: string;
    client_id: string;
    threshold?: number;
    use_key_criteria?: boolean;
    recruiter_id?: string;
  };

  if (!requisition_id) {
    return res.status(400).json({ error: "requisition_id is required" });
  }

  // Fetch requisition + JD + conditions in parallel
  const [{ data: requisition }, { data: conditions }, { data: existingProcesses }] = await Promise.all([
    supabase
      .from("requisitions")
      .select("id, team_id, title, jd_text, jd_url, salary_min, salary_max, strategic_context, interview_notes")
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
      .eq("requisition_id", requisition_id)
      .not("stage", "in", '("Placed","Closed lost")'),
  ]);

  if (!requisition) return res.status(404).json({ error: "Requisition not found" });

  const r = requisition as {
    team_id: string;
    title: string;
    jd_text: string | null;
    salary_min: number | null;
    salary_max: number | null;
    strategic_context: string | null;
    interview_notes: string | null;
  };

  // Candidates already in process for this requisition — exclude from AI results
  const excludedIds = new Set(
    (existingProcesses ?? []).map((p: { candidate_id: string }) => p.candidate_id),
  );

  // Candidates in active process with the same client — also exclude
  const { data: clientProcesses } = await supabase
    .from("processes")
    .select("candidate_id, requisitions ( client_id )")
    .eq("team_id", r.team_id)
    .not("stage", "in", '("Placed","Closed lost")');

  (clientProcesses ?? []).forEach((p: { candidate_id: string; requisitions: { client_id: string } | null }) => {
    if (p.requisitions?.client_id === client_id) {
      excludedIds.add(p.candidate_id);
    }
  });

  const conditionRows = (conditions ?? []) as { condition_text: string; condition_type: string; priority_rank: number; weight: number }[];

  // Stage 1 — retrieve. Bounded, relevance-ranked candidate ids from the
  // database (hybrid vector + full-text search), instead of loading every
  // active/passive candidate in the team.
  const candidateIds = await retrieveCandidateIds({
    teamId: r.team_id,
    title: r.title,
    jdText: r.jd_text,
    strategicContext: r.strategic_context,
    conditions: conditionRows,
    statuses: ["active", "passive"],
    excludedIds: [...excludedIds],
    limit: 100,
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
    age: number | null;
    current_base: number | null;
    base_minimum: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    notes_pitch: string | null;
    notes_personality: string | null;
  };

  const { data: retrieved } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, japanese_level, english_level, age, current_base, base_minimum, expected_total_min, expected_total_max, notes_pitch, notes_personality",
    )
    .in("id", candidateIds);

  // .in() does not preserve order — re-sort to the retrieval stage's
  // relevance ranking so the safety-cap slice below drops the least
  // relevant candidates, not an arbitrary DB-order tail.
  const rankById = new Map(candidateIds.map((id, i) => [id, i]));
  const eligible = ((retrieved ?? []) as CandidateRecord[]).sort(
    (a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0),
  );

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const dealbreakers = conditionRows
    .filter((c) => c.condition_type === "dealbreaker")
    .map((c) => `${c.condition_text} (importance: ${c.weight}/10)`)
    .join("\n");

  const mustHaves = conditionRows
    .filter((c) => c.condition_type === "must_have")
    .map((c) => `${c.priority_rank}. ${c.condition_text} (importance: ${c.weight}/10)`)
    .join("\n");

  const flexCriteria = conditionRows
    .filter((c) => c.condition_type === "nice_to_have")
    .map((c) => `- ${c.condition_text} (importance: ${c.weight}/10)`)
    .join("\n");

  const candidatesSummary = eligible.slice(0, 80).map((c: CandidateRecord) => {
    const salaryStretch =
      r.salary_max && c.expected_total_min && c.expected_total_min > r.salary_max;
    return `ID:${c.id}
Name: ${c.full_name}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Age: ${c.age ?? "—"}
Languages: JA ${c.japanese_level ?? "—"} / EN ${c.english_level ?? "—"}
Base: ${formatYen(c.base_minimum ?? c.current_base)} | Expected: ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}${salaryStretch ? " [STRETCH]" : ""}
${c.notes_pitch ? `Pitch notes: ${c.notes_pitch.slice(0, 200)}` : ""}`;
  }).join("\n\n---\n\n");

  const keyCriteriaInstruction = use_key_criteria && mustHaves
    ? `
KEY CRITERIA TIERING (active):
- meets_must_haves: true if candidate clearly meets ALL must-have criteria
- close_on_must_haves: true if candidate meets most must-haves but has a minor gap on one
- Candidates far from must-haves should have very low scores and will be filtered client-side`
    : "";

  const prompt = `
ROLE: ${r.title}
Salary range: ${formatYen(r.salary_min)}–${formatYen(r.salary_max)}

Dealbreakers (hard exclude — score no higher than 20 if a candidate clearly fails one of these):
${dealbreakers || "None specified."}

Must-have criteria (hard signals — language levels are strict in the Japan bilingual market):
${mustHaves || "None specified."}

Flexible criteria (add score weight but do not gate inclusion):
${flexCriteria || "None specified."}

${r.jd_text ? `Job description:\n${r.jd_text.slice(0, 1000)}` : ""}
${r.strategic_context ? `Strategic context:\n${r.strategic_context.slice(0, 400)}` : ""}
${keyCriteriaInstruction}

CANDIDATES TO RANK (already relevance-ordered — earlier candidates are a stronger retrieval match):
${candidatesSummary}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    thinking: { type: "disabled" },
    system: `You are ranking candidates for an open role at a company in Japan.

Score each candidate 30–100. Apply the threshold: only return candidates scoring ${threshold} or above.
Return at most 50 candidates, ranked highest score first.

Dealbreakers are a hard exclude — a candidate who clearly fails one should score no higher than 20, regardless of other fit. Use higher-importance dealbreakers/must-haves to break ties among otherwise-similar candidates.
Language requirements are strict in Japan — if a must-have language level is not met, cap the score at 45.
Salary stretch (candidate expected > role max): keep in results if overall fit is strong, flag it.

Be specific in reason — reference actual must-have criteria and the candidate's stated background.
One sentence per reason. Direct, no filler.

Return valid JSON only, no markdown:
{
  "matches": [
    {
      "candidate_id": string,
      "score": number,
      "reason": string,
      "is_salary_stretch": boolean,
      "meets_must_haves": boolean,
      "close_on_must_haves": boolean
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
