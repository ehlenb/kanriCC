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

  const { candidateId, processId, recruiterId } = req.body as {
    candidateId: string;
    processId: string;
    recruiterId: string;
  };

  if (!candidateId || !processId || !recruiterId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [
    { data: candidate },
    { data: motivations },
    { data: roles },
    { data: process },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, age, current_company, current_title, japanese_level, english_level, current_total, expected_total_min, expected_total_max, base_is_priority, base_minimum, notes_presentation, notes_personality, notes_pitch",
      )
      .eq("id", candidateId)
      .single(),
    supabase
      .from("candidate_motivations")
      .select("rank, motivation_text")
      .eq("candidate_id", candidateId)
      .order("rank"),
    supabase
      .from("candidate_roles")
      .select("company_name, title, start_date, end_date, is_current, achievement_notes")
      .eq("candidate_id", candidateId)
      .order("start_date", { ascending: true }),
    supabase
      .from("processes")
      .select(
        "stage, requisitions ( title, why_role_opened, strategic_context, clients ( company_name ) )",
      )
      .eq("id", processId)
      .single(),
  ]);

  if (!candidate || !process) {
    return res.status(404).json({ error: "Data not found" });
  }

  const c = candidate as {
    full_name: string;
    full_name_japanese: string | null;
    age: number | null;
    current_company: string | null;
    current_title: string | null;
    japanese_level: string | null;
    english_level: string | null;
    current_total: number | null;
    expected_total_min: number | null;
    expected_total_max: number | null;
    base_is_priority: boolean;
    base_minimum: number | null;
    notes_presentation: string | null;
    notes_personality: string | null;
    notes_pitch: string | null;
  };

  const req_ = (process as { requisitions: unknown }).requisitions as {
    title: string;
    why_role_opened: string | null;
    strategic_context: string | null;
    clients: { company_name: string } | null;
  } | null;

  const formatYen = (n: number | null) =>
    n ? `¥${(n / 1_000_000).toFixed(1)}M` : "—";

  const prompt = `
Candidate: ${c.full_name}${c.full_name_japanese ? ` (${c.full_name_japanese})` : ""}${c.age ? `, age ${c.age}` : ""}
Current role: ${c.current_title ?? "—"} at ${c.current_company ?? "—"}
Languages: Japanese ${c.japanese_level ?? "—"}, English ${c.english_level ?? "—"}
Expected salary: ${formatYen(c.expected_total_min)} – ${formatYen(c.expected_total_max)}
${c.base_is_priority ? `Base priority: YES — minimum ${formatYen(c.base_minimum)}` : ""}

Career history:
${(roles ?? []).map((r: { company_name: string; title: string | null; start_date: string | null; end_date: string | null; is_current: boolean; achievement_notes: string | null }) => `- ${r.company_name}${r.is_current ? " (current)" : ""}: ${r.title ?? "—"}. ${r.achievement_notes ? r.achievement_notes.slice(0, 300) : ""}`).join("\n")}

Top motivations (candidate-ranked — do NOT expose ranking to client):
${(motivations ?? []).map((m: { rank: number; motivation_text: string }) => `${m.rank}. ${m.motivation_text}`).join("\n")}

${c.notes_presentation ? `Presentation and communication style:\n${c.notes_presentation}` : ""}
${c.notes_personality ? `Personality and working style:\n${c.notes_personality}` : ""}
${c.notes_pitch ? `Pitch notes (recruiter highlights):\n${c.notes_pitch}` : ""}

Target role: ${req_?.title ?? "—"} at ${req_?.clients?.company_name ?? "—"}
Why role opened: ${req_?.why_role_opened ?? "Not specified"}
Strategic context: ${req_?.strategic_context ?? "Not specified"}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: `You are an elite recruitment consultant writing a candidate submission report for a client in Japan. Write in clear accessible English suitable for non-native speakers. Include these sections with clear headers:

1. Executive summary (2–3 sentences)
2. Key recommendation points (3–4 bullets)
3. Career highlights (concise, focused on achievements)
4. Personality and communication style: use ONLY the presentation and personality notes provided. Do NOT invent anything. If no notes are provided, omit this section entirely.
5. Expected salary (state the range clearly)
6. Why considering a move (frame positively — never reveal the raw internal reason for leaving)
7. Why this candidate fits the role

Keep each section concise. The recruiter will review and edit before sending. Do not use: straightforward, genuinely, honestly, leverage as a verb, utilize.`,
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
