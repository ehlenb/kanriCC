import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { candidateId, recruiterId } = req.body as {
    candidateId: string;
    recruiterId: string;
  };

  if (!candidateId || !recruiterId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [
    { data: candidate },
    { data: motivations },
    { data: blockers },
    { data: roles },
    { data: recentInteractions },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, current_company, current_title, japanese_level, english_level, active_passive, urgency_to_move, notice_period_months, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_presentation, notes_personality, notes_closing",
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
      .select("is_risk, theme, detail")
      .eq("candidate_id", candidateId),
    supabase
      .from("candidate_roles")
      .select("company_name, title, is_current, achievement_notes")
      .eq("candidate_id", candidateId)
      .order("start_date", { ascending: false })
      .limit(2),
    supabase
      .from("interactions")
      .select("summary, interaction_type, interacted_at")
      .eq("candidate_id", candidateId)
      .order("interacted_at", { ascending: false })
      .limit(5),
  ]);

  if (!candidate) {
    return res.status(404).json({ error: "Candidate not found" });
  }

  const c = candidate as {
    full_name: string;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    active_passive: string | null;
    urgency_to_move: string | null;
    notice_period_months: number | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean;
    base_minimum: number | null;
    notes_presentation: string | null;
    notes_personality: string | null;
    notes_closing: string | null;
  };

  const formatYen = (n: number | null) =>
    n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";

  const prompt = `
Candidate: ${c.full_name}
Current: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Language: Japanese ${c.japanese_level ?? "—"}, English ${c.english_level ?? "—"}
Status: ${c.active_passive ?? "—"}, urgency ${c.urgency_to_move ?? "—"}, notice ${c.notice_period_months ?? "—"} months
Compensation: Current ${formatYen(c.current_total)}, expected ${formatYen(c.expected_total_min)}–${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}

Recent roles:
${(roles ?? []).map((r: { company_name: string; title: string | null; is_current: boolean; achievement_notes: string | null }) => `- ${r.company_name}${r.is_current ? " (current)" : ""}: ${r.title ?? "—"}. ${r.achievement_notes ? r.achievement_notes.slice(0, 200) : ""}`).join("\n")}

Top motivations (ranked by candidate):
${(motivations ?? []).map((m: { rank: number; motivation_text: string }) => `${m.rank}. ${m.motivation_text}`).join("\n")}

Blockers and context:
${(blockers ?? []).map((b: { is_risk: boolean; theme: string; detail: string | null }) => `${b.is_risk ? "[RISK]" : "[CONTEXT]"} ${b.theme}: ${b.detail ?? ""}`).join("\n")}

Recent interactions:
${(recentInteractions ?? []).map((i: { interaction_type: string; interacted_at: string; summary: string | null }) => `- ${i.interaction_type} on ${new Date(i.interacted_at).toLocaleDateString()}: ${i.summary ?? "No summary"}`).join("\n")}
${c.notes_presentation ? `\nPresentation and communication style:\n${c.notes_presentation}` : ""}
${c.notes_personality ? `\nPersonality and working style:\n${c.notes_personality}` : ""}
${c.notes_closing ? `\nClosing intelligence (confidential — for recruiter coaching only):\n${c.notes_closing}` : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 700,
    system: `You are a recruiting intelligence assistant preparing a pre-call briefing for a recruiter in Japan. The recruiter reads this in 60 seconds before picking up the phone. Make it scannable and immediately actionable. Write in clear English for non-native speakers.

FORBIDDEN WORDS: straightforward, genuinely, honestly, leverage (as a verb), utilize.

Structure:
1. WHO THEY ARE (2 sentences max): current role, background, language levels.
2. WHAT THEY CARE ABOUT MOST (bullets): use candidate's ranked motivations. Bold theme phrase first. One sentence each. Max 3 bullets. If personality or working style notes are provided, add one bullet on what approach works best with them.
3. WATCH OUT FOR ON THIS CALL (bullets): most critical risks and unresolved issues. Bold theme phrase first. One sentence each. Max 3 bullets. If closing intelligence is provided, flag the key closing risk here.
4. SUGGESTED TALKING POINTS (2–3 points): use the NFAR framework implicitly — never label sections. Natural and conversational. Each point 2–3 sentences max. Sequence by motivation ranking. The recruiter internalizes these — they do not read them verbatim.

Japan market context: apply knowledge of domestic candidate psychology, bilingual scarcity, and foreign firm objection handling where relevant.`,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content =
    message.content[0].type === "text" ? message.content[0].text : "";

  return res.status(200).json({ content });
}
