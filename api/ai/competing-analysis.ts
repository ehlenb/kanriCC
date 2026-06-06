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

  const { candidate_id, recruiter_id } = req.body as {
    candidate_id: string;
    recruiter_id: string;
  };
  if (!candidate_id || !recruiter_id) return res.status(400).json({ error: "Missing fields" });

  // Fetch candidate context (never notes_internal or notes_presentation)
  const [
    { data: candidate },
    { data: competing },
    { data: processes },
    { data: motivations },
    { data: blockers },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, current_title, current_company, japanese_level, english_level, active_passive, urgency_notes, comp_notes, notes_personality, notes_pitch, notes_closing, current_total, expected_total_min, expected_total_max",
      )
      .eq("id", candidate_id)
      .eq("recruiter_id", recruiter_id)
      .single(),
    supabase
      .from("competing_interviews")
      .select("company_name, stage, source, disclosed_at")
      .eq("candidate_id", candidate_id),
    supabase
      .from("processes")
      .select(
        "stage, created_at, requisitions ( title, salary_min, salary_max, why_role_opened, strategic_context, clients ( company_name, years_in_japan, japan_team_size, japan_team_japanese_pct, strategy_notes ) )",
      )
      .eq("candidate_id", candidate_id)
      .eq("owner_recruiter_id", recruiter_id)
      .not("stage", "in", '("Closed won","Closed lost")'),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text")
      .eq("candidate_id", candidate_id)
      .order("rank"),
    supabase
      .from("candidate_blockers")
      .select("theme, detail, is_risk")
      .eq("candidate_id", candidate_id),
  ]);

  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const formatComp = (v: number | null) =>
    v ? `¥${(v / 1_000_000).toFixed(1)}M` : null;

  const activeProcessLines = (processes ?? []).map((p) => {
    const req = (Array.isArray(p.requisitions) ? p.requisitions[0] : p.requisitions) as {
      title: string;
      salary_min: number | null;
      salary_max: number | null;
      why_role_opened: string | null;
      strategic_context: string | null;
      clients: {
        company_name: string;
        years_in_japan: number | null;
        japan_team_size: number | null;
        japan_team_japanese_pct: number | null;
        strategy_notes: string | null;
      } | null;
    } | null;
    const client = req?.clients;
    const salary = [formatComp(req?.salary_min ?? null), formatComp(req?.salary_max ?? null)]
      .filter(Boolean).join("–");
    return [
      `  Company: ${client?.company_name ?? "Unknown"}`,
      `  Role: ${req?.title ?? "Unknown"} ${salary ? `(${salary})` : ""}`,
      `  Stage: ${p.stage}`,
      client?.years_in_japan ? `  Years in Japan: ${client.years_in_japan}` : null,
      client?.japan_team_size ? `  Japan team size: ${client.japan_team_size}` : null,
      client?.japan_team_japanese_pct ? `  Team Japanese %: ${client.japan_team_japanese_pct}%` : null,
      req?.why_role_opened ? `  Why role opened: ${req.why_role_opened}` : null,
      req?.strategic_context ? `  Strategic context: ${req.strategic_context}` : null,
      client?.strategy_notes ? `  Client strategy notes: ${client.strategy_notes}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const competingLines = (competing ?? []).map((c) =>
    `  - ${c.company_name}${c.stage ? ` (${c.stage})` : ""}${c.disclosed_at ? ` — disclosed ${c.disclosed_at}` : ""}`
  ).join("\n");

  const motivationLines = (motivations ?? []).map((m, i) =>
    `  ${i + 1}. ${m.motivation_text}`
  ).join("\n");

  const blockerLines = (blockers ?? []).map((b) =>
    `  - [${b.is_risk ? "RISK" : "concern"}] ${b.theme}: ${b.detail}`
  ).join("\n");

  const prompt = `You are a brutally honest senior recruiter advisor helping a boutique Japan-market recruiter manage a competitive situation.

CANDIDATE
Name: ${candidate.full_name_japanese ? `${candidate.full_name_japanese} / ` : ""}${candidate.full_name}
Current: ${candidate.current_title ?? "—"} at ${candidate.current_company ?? "—"}
Languages: Japanese ${candidate.japanese_level ?? "?"} / English ${candidate.english_level ?? "?"}
Urgency to move: ${candidate.active_passive ?? "unknown"}
Comp: Current ${formatComp(candidate.current_total) ?? "unknown"}, expecting ${[formatComp(candidate.expected_total_min ?? null), formatComp(candidate.expected_total_max ?? null)].filter(Boolean).join("–") || "unknown"}
${candidate.urgency_notes ? `Urgency notes: ${candidate.urgency_notes}` : ""}
${candidate.comp_notes ? `Comp notes: ${candidate.comp_notes}` : ""}

CANDIDATE PROFILE NOTES
Personality: ${candidate.notes_personality ?? "Not recorded"}
What resonates (pitch): ${candidate.notes_pitch ?? "Not recorded"}
How to close: ${candidate.notes_closing ?? "Not recorded"}

STATED MOTIVATIONS (ranked)
${motivationLines || "  None recorded"}

RISKS / CONCERNS
${blockerLines || "  None recorded"}

YOUR ACTIVE PROCESSES WITH THIS CANDIDATE
${activeProcessLines || "  None"}

COMPETING INTERVIEWS (logged by recruiter)
${competingLines || "  None logged"}

---
Write a brutally honest competitive situation analysis for the recruiter. Be direct — no fluff, no hedging. Structure your response as follows:

**RISK LEVEL**: [Critical / High / Medium / Low] — one sentence on why

**HONEST COMPARISON**
How do the competing companies compare to your client companies for THIS specific candidate? Consider: what this candidate has said they care about, their Japanese level (which affects what companies suit them), comp expectations, and any stated preferences. Be blunt about where your clients are stronger AND weaker.

**CANDIDATE'S REAL MOTIVATIONS**
Based on what you know, what is this candidate actually optimising for? What would make them choose one offer over another? What matters most to THEM (not what sounds good in an interview)?

**RECRUITER TALKING POINTS**
3–5 specific, concrete things to say or ask in the next conversation. These should be tailored to this candidate's personality and what you know closes them. Not generic — specific to this person.

**WHAT COULD GO WRONG**
One paragraph on the most likely way you lose this candidate and what to watch for.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";

  return res.status(200).json({ analysis: text });
}
