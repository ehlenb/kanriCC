import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isBonusSeason } from "../../src/lib/candidate-utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { candidate_id, intent, channel } = req.body as {
    candidate_id: string;
    intent: string;
    channel: "email" | "linkedin";
  };
  if (!candidate_id || !intent) return res.status(400).json({ error: "Missing required fields" });

  const [{ data: candidate }, { data: interactions }] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "full_name, full_name_japanese, current_company, current_title, age, japanese_level, english_level, notes_pitch, notes_interview, active_passive, urgency_notes"
      )
      .eq("id", candidate_id)
      .single(),
    supabase
      .from("interactions")
      .select("interaction_type, summary, interacted_at")
      .eq("candidate_id", candidate_id)
      .order("interacted_at", { ascending: false })
      .limit(5),
  ]);

  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const c = candidate as {
    full_name: string;
    full_name_japanese: string | null;
    current_company: string | null;
    current_title: string | null;
    age: number | null;
    japanese_level: string | null;
    english_level: string | null;
    notes_pitch: string | null;
    notes_interview: string | null;
    active_passive: string | null;
    urgency_notes: string | null;
  };

  const firstName = c.full_name.split(" ")[0];
  const recentActivity = ((interactions as Array<{ interaction_type: string; summary: string | null; interacted_at: string }>) ?? [])
    .map((i) => `${i.interacted_at.slice(0, 10)} — ${i.interaction_type}: ${i.summary ?? "(no summary)"}`)
    .join("\n");

  const bonusSeason = isBonusSeason();
  const channelNote =
    channel === "linkedin"
      ? "LinkedIn message — shorter, more conversational, under 150 words."
      : "Email — professional but warm, 200–300 words maximum.";

  const prompt = `
Candidate: ${c.full_name}${c.full_name_japanese ? ` (${c.full_name_japanese})` : ""}
Current role: ${c.current_title ?? "unknown"} at ${c.current_company ?? "unknown"}
Age: ${c.age ?? "unknown"}
Japanese: ${c.japanese_level ?? "unknown"} | English: ${c.english_level ?? "unknown"}
Status: ${c.active_passive ?? "unknown"}${c.urgency_notes ? ` — ${c.urgency_notes}` : ""}

${c.notes_pitch ? `Pitch notes:\n${c.notes_pitch.slice(0, 500)}` : ""}
${c.notes_interview ? `Registration notes:\n${c.notes_interview.slice(0, 600)}` : ""}
${recentActivity ? `Recent activity:\n${recentActivity}` : ""}

Step intent: ${intent}
Channel: ${channelNote}
${bonusSeason ? "NOTE: It is currently bonus season in Japan (Jan–Mar or Jun–Jul). Do not push urgency framing. Do not reference timing pressure. Be patient and informational." : ""}
`.trim();

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    system: `You are drafting an outreach message on behalf of a recruiter in Japan.

The recruiter is reaching out to a candidate. Write the message as if from the recruiter.

Rules:
- Warm, personal, and respectful. Never pushy.
- Reference the candidate's specific situation — their current company, their motivations, or something from the notes. Generic messages are a failure.
- For domestic-to-foreign moves: acknowledge the candidate's current brand and the legitimacy of their concern. Foreign firms in Japan offer merit-based promotion, higher base, and flexibility — mention these naturally if relevant.
- Do not imply the candidate must act quickly unless you have a specific reason.
- No subject line. No sign-off name — end with a simple friendly close.
- Use first name only to address the candidate.
- FORBIDDEN WORDS: straightforward, genuinely, honestly, leverage (as a verb), utilize.
- No em dashes. Plain, clear English. Short sentences.`,
    messages: [{ role: "user", content: prompt }],
  });

  const draft = message.content[0].type === "text" ? message.content[0].text : "";
  return res.status(200).json({ draft });
}
