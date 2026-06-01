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
      .select("id, title, jd_text, jd_url, salary_min, salary_max, strategic_context, interview_notes")
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
      .eq("requisition_id", requisition_id)
      .not("stage", "in", '("Placed","Closed lost")'),
  ]);

  if (!requisition) return res.status(404).json({ error: "Requisition not found" });

  // Candidates already in process for this requisition — exclude from AI results
  const excludedIds = new Set(
    (existingProcesses ?? []).map((p: { candidate_id: string }) => p.candidate_id),
  );

  // Candidates in active process with the same client — also exclude
  const { data: clientProcesses } = await supabase
    .from("processes")
    .select("candidate_id, requisitions ( client_id )")
    .not("stage", "in", '("Placed","Closed lost")');

  (clientProcesses ?? []).forEach((p: { candidate_id: string; requisitions: { client_id: string } | null }) => {
    if (p.requisitions?.client_id === client_id) {
      excludedIds.add(p.candidate_id);
    }
  });

  // Fetch all eligible candidates (all team members' candidates via service role)
  const { data: allCandidates } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_title, current_company, japanese_level, english_level, age, current_base, base_minimum, expected_total_min, expected_total_max, candidate_status, placed_at, coin_icon_dismissed, notes_pitch, notes_personality",
    )
    .in("candidate_status", ["active", "passive"]);

  const now = new Date();
  const eligible = (allCandidates ?? []).filter((c: {
    id: string;
    candidate_status: string;
    placed_at: string | null;
    coin_icon_dismissed: boolean;
  }) => {
    if (excludedIds.has(c.id)) return false;
    // Exclude placed within 90 days unless coin dismissed
    if (c.candidate_status === "placed" && c.placed_at && !c.coin_icon_dismissed) {
      const days = Math.floor((now.getTime() - new Date(c.placed_at).getTime()) / 86_400_000);
      if (days <= 90) return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return res.status(200).json({ matches: [] });
  }

  const r = requisition as {
    title: string;
    jd_text: string | null;
    salary_min: number | null;
    salary_max: number | null;
    strategic_context: string | null;
    interview_notes: string | null;
  };

  const formatYen = (n: number | null) => (n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—");

  const mustHaves = (conditions ?? [])
    .filter((c: { condition_type: string }) => c.condition_type === "must_have")
    .map((c: { priority_rank: number; condition_text: string }) => `${c.priority_rank}. ${c.condition_text}`)
    .join("\n");

  const flexCriteria = (conditions ?? [])
    .filter((c: { condition_type: string }) => c.condition_type === "nice_to_have")
    .map((c: { condition_text: string }) => `- ${c.condition_text}`)
    .join("\n");

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

  const candidatesSummary = eligible.slice(0, 60).map((c: CandidateRecord) => {
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

Must-have criteria (hard signals — language levels are strict in the Japan bilingual market):
${mustHaves || "None specified."}

Flexible criteria (add score weight but do not gate inclusion):
${flexCriteria || "None specified."}

${r.jd_text ? `Job description:\n${r.jd_text.slice(0, 1000)}` : ""}
${r.strategic_context ? `Strategic context:\n${r.strategic_context.slice(0, 400)}` : ""}
${keyCriteriaInstruction}

CANDIDATES TO RANK:
${candidatesSummary}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2500,
    system: `You are ranking candidates for an open role at a company in Japan.

Score each candidate 30–100. Apply the threshold: only return candidates scoring ${threshold} or above.
Return at most 50 candidates, ranked highest score first.

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

  const raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { matches: unknown[] };
    return res.status(200).json(parsed);
  } catch {
    return res.status(200).json({ error: "Parse failed", raw });
  }
}
