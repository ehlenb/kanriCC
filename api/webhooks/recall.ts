import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

type TranscriptSegment = {
  speaker: string;
  words: Array<{ text: string; start_time?: number; end_time?: number }>;
};

type RecallEvent = {
  event: string;
  data: {
    bot_id?: string;
    transcript?: TranscriptSegment[];
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = req.body as RecallEvent;

  // Acknowledge quickly — Recall.ai expects 2xx within 5 seconds
  res.json({ received: true });

  const { event, data } = payload;

  // Handle bot status updates
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (event === "bot.joining_call" || event === "bot.in_waiting_room") {
    await supabase
      .from("recall_bot_sessions")
      .update({ status: "in_progress" })
      .eq("bot_id", data.bot_id!);
    return;
  }

  if (event === "bot.fatal_error" || event === "bot.kicked" || event === "bot.recording_permission_denied") {
    await supabase
      .from("recall_bot_sessions")
      .update({ status: "failed" })
      .eq("bot_id", data.bot_id!);
    return;
  }

  if (event !== "bot.transcription_complete") return;

  const botId = data.bot_id;
  const segments = data.transcript ?? [];

  if (!botId || segments.length === 0) return;

  // Look up the bot session to get candidate_id and recruiter_id
  const { data: session } = await supabase
    .from("recall_bot_sessions")
    .select("candidate_id, recruiter_id, team_id")
    .eq("bot_id", botId)
    .single();

  if (!session) {
    console.error("recall webhook: no session found for bot_id", botId);
    return;
  }

  // Convert transcript segments to plain text
  const rawTranscript = segments
    .map((seg) => {
      const text = seg.words.map((w) => w.text).join(" ");
      return `${seg.speaker}: ${text}`;
    })
    .join("\n");

  // Format via Claude (same logic as format-interview-notes.ts)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let formattedNotes: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are formatting a call transcript from a recruiter registration call into clean interview notes.

Format rules:
- Use short sections with clear headers in capitals (e.g. BACKGROUND, CAREER HISTORY, MOTIVATIONS, KEY SKILLS)
- Each bullet should be one plain sentence. No jargon.
- Career history: list roles in order from oldest to most recent. One bullet per role.
- Do not invent information not in the source. If something is not mentioned, skip that section.
- Do not use em dashes. Do not use the words "straightforward", "genuinely", "honestly", "leverage" or "utilize".
- Output plain text only. No markdown formatting, no asterisks, no hashes.

Transcript:
${rawTranscript.slice(0, 8000)}`,
        },
      ],
    });

    const content = message.content[0];
    formattedNotes = content.type === "text" ? content.text.trim() : rawTranscript;
  } catch (err) {
    console.error("recall webhook: AI formatting failed:", err);
    formattedNotes = rawTranscript;
  }

  // Insert into interactions
  const now = new Date().toISOString();
  await supabase.from("interactions").insert({
    candidate_id: session.candidate_id,
    recruiter_id: session.recruiter_id,
    team_id: session.team_id,
    interaction_type: "note",
    primary_party: "candidate",
    summary: "Auto-transcribed call via Recall.ai",
    full_notes: formattedNotes,
    interacted_at: now,
  });

  // Mark bot session done
  await supabase
    .from("recall_bot_sessions")
    .update({ status: "done" })
    .eq("bot_id", botId);
}
