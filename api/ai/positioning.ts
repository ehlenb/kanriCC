import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { processId, candidateId, recruiterId } = req.body as {
    processId: string;
    candidateId: string;
    recruiterId: string;
  };

  if (!processId || !candidateId || !recruiterId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Fetch all context needed for positioning
  const [
    { data: candidate },
    { data: motivations },
    { data: blockers },
    { data: process },
    { data: recentInteractions },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, current_company, current_title, japanese_level, english_level, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_interview, comp_notes",
      )
      .eq("id", candidateId)
      .single(),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text")
      .eq("candidate_id", candidateId)
      .order("rank"),
    supabase
      .from("candidate_blockers")
      .select("theme, detail")
      .eq("candidate_id", candidateId)
      .eq("is_risk", true),
    supabase
      .from("processes")
      .select(
        "stage, requisitions ( title, salary_min, salary_max, salary_stretch, why_role_opened, strategic_context, clients ( company_name, years_in_japan, japan_team_size, japan_team_japanese_pct ) )",
      )
      .eq("id", processId)
      .single(),
    supabase
      .from("interactions")
      .select("interaction_type, interacted_at, summary, full_notes, primary_party")
      .eq("candidate_id", candidateId)
      .not("interaction_type", "eq", "note")
      .order("interacted_at", { ascending: false })
      .limit(5),
  ]);

  if (!candidate || !process) {
    return res.status(404).json({ error: "Data not found" });
  }

  const req_ = (process as { requisitions: unknown }).requisitions as {
    title: string;
    salary_min: number | null;
    salary_max: number | null;
    salary_stretch: number | null;
    why_role_opened: string | null;
    strategic_context: string | null;
    clients: {
      company_name: string;
      years_in_japan: number | null;
      japan_team_size: number | null;
      japan_team_japanese_pct: number | null;
    } | null;
  } | null;

  type RiskBlocker = { theme: string; detail: string | null };
  const riskBlockers = (blockers ?? []) as RiskBlocker[];

  const formatYen = (n: number | null) =>
    n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";

  type CandidateData = {
    full_name: string;
    current_title: string | null;
    current_company: string | null;
    japanese_level: string | null;
    english_level: string | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean;
    base_minimum: number | null;
    notes_interview: string | null;
    comp_notes: string | null;
  };
  const c = candidate as CandidateData;

  type RecentInteraction = { interaction_type: string; interacted_at: string; summary: string | null; full_notes: string | null; primary_party: string | null };
  const interactions = (recentInteractions ?? []) as RecentInteraction[];

  const prompt = `
Candidate: ${c.full_name}
Current role: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Japanese: ${c.japanese_level ?? "—"} | English: ${c.english_level ?? "—"}
Current total: ${formatYen(c.current_total)} | Expected: ${formatYen(c.expected_total_min)} – ${formatYen(c.expected_total_max)}
Base priority: ${c.base_is_priority ? `Yes — minimum ${formatYen(c.base_minimum)}` : "No"}

${c.notes_interview ? `REGISTRATION INTERVIEW NOTES (base knowledge — may be superseded by recent activity below):
${c.notes_interview}` : ""}

${c.comp_notes ? `Compensation context (recruiter notes): ${c.comp_notes}` : ""}

${(motivations ?? []).length > 0 ? `Ranked motivations (explicitly recorded):
${(motivations ?? []).map((m: { rank: number; motivation_text: string }) => `${m.rank}. ${m.motivation_text}`).join("\n")}` : ""}

${riskBlockers.length > 0 ? `Risk flags:
${riskBlockers.map((b) => `- ${b.theme}${b.detail ? `: ${b.detail}` : ""}`).join("\n")}` : ""}

${interactions.length > 0 ? `RECENT ACTIVITY (most recent first — treat as fresher intelligence that may update the interview notes above):
${interactions.map((i) => `- ${i.interaction_type}${i.primary_party ? ` (${i.primary_party}-side)` : ""} on ${new Date(i.interacted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}: ${i.full_notes?.slice(0, 300) ?? i.summary ?? "No notes"}`).join("\n")}` : ""}

Role: ${req_?.title ?? "—"} at ${req_?.clients?.company_name ?? "—"}
Salary: ${formatYen(req_?.salary_min ?? null)} – ${formatYen(req_?.salary_max ?? null)}${req_?.salary_stretch ? ` (stretch to ${formatYen(req_.salary_stretch)})` : ""}
Client: ${req_?.clients?.years_in_japan ? `${req_.clients.years_in_japan} years in Japan` : ""}${req_?.clients?.japan_team_japanese_pct ? `, ${req_.clients.japan_team_japanese_pct}% Japanese team` : ""}
Why role opened: ${req_?.why_role_opened ?? "Not specified"}
Strategic context: ${req_?.strategic_context ?? "Not specified"}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 700,
    system: `You are an elite recruiting strategist preparing positioning talking points for a recruiter in Japan.

FORBIDDEN WORDS: straightforward, genuinely, honestly, leverage (as a verb), utilize.

The registration interview notes are the primary source of truth for understanding this candidate — their motivations, concerns, and situation. Recent activity logs (if present) reflect newer intelligence and take priority over the interview notes when they conflict.

Generate exactly 3 talking points. Each one must:
- Use the NFAR framework implicitly: identify the need/pain, introduce the differentiator, suggest the action, state the outcome. Never label the framework.
- Sound natural and conversational — the recruiter internalizes these, not reads them verbatim.
- Be 2–3 sentences maximum.
- Start with a short label (2–4 words) naming the topic it addresses.
- Be specific to this candidate and this role — generic points are a failure state.

Sequencing rules:
- Talking point 1: the candidate's strongest or most urgent motivation.
- Talking point 2: the next most important motivation or a key differentiator of this role.
- Talking point 3: the most critical risk or concern to address proactively (from interview notes, blockers, or recent activity). If no risk exists, use a third motivation angle.

Japan market context to apply where relevant:
- Bilingual scarcity: this candidate profile is rare; competing roles at this level are few.
- Domestic-to-foreign concerns: use client's Japan tenure and Japanese team percentage to address stability fears.
- Seniority frustration: if motivation includes merit-based advancement, contrast with the client's performance culture.
- Counteroffer risk: if at offer stage, apply the 60–80% / 90% statistics.
- Bonus timing: if notes or comp context mention a bonus cycle or waiting on a payout (June and December are standard in Japan), factor this into talking point framing — do not push urgency if the candidate is waiting on a bonus. Acknowledge the timing and frame around the right next step.

Respond ONLY with valid JSON, no markdown, no explanation:
{"points": [{"label": "...", "body": "..."}, {"label": "...", "body": "..."}, {"label": "...", "body": "..."}]}`,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = message.content[0].type === "text" ? message.content[0].text : "{}";

  let points: Array<{ label: string; body: string }> = [];
  try {
    const parsed = JSON.parse(rawText) as { points?: Array<{ label: string; body: string }> };
    if (Array.isArray(parsed.points)) points = parsed.points;
  } catch {
    // Fallback: wrap raw text as a single block
    points = [{ label: "Positioning", body: rawText }];
  }

  const jsonString = JSON.stringify({ points });

  // Cache the structured JSON back to the process row
  await supabase
    .from("processes")
    .update({ ai_snapshot: jsonString })
    .eq("id", processId);

  return res.status(200).json({ points });
}
