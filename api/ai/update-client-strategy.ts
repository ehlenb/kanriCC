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

  const { client_id, interaction_summary, interaction_notes } = req.body as {
    client_id: string;
    interaction_summary: string | null;
    interaction_notes: string | null;
  };

  if (!client_id) return res.status(400).json({ error: "client_id is required" });

  const newIntel = [interaction_summary, interaction_notes].filter(Boolean).join("\n\n").trim();
  if (!newIntel) return res.status(400).json({ error: "No interaction content to process" });

  const { data: client } = await supabase
    .from("clients")
    .select("company_name, strategy_notes")
    .eq("id", client_id)
    .single();

  if (!client) return res.status(404).json({ error: "Client not found" });

  const existing = (client as { company_name: string; strategy_notes: string | null }).strategy_notes?.trim() ?? "";
  const companyName = (client as { company_name: string; strategy_notes: string | null }).company_name;

  const prompt = existing
    ? `You are a recruiting intelligence system maintaining a live strategy brief for ${companyName}, a client of a Japan bilingual recruitment agency.

A recruiter just logged new activity. Your job: decide if it contains anything strategically useful, then act.

EXISTING STRATEGY NOTES:
${existing}

NEW ACTIVITY LOG:
${newIntel}

Rules:
- First, judge whether the new log adds anything strategically useful. Examples of useful: hiring preferences, cultural fit signals, interviewer feedback, what impresses this client, relationship dynamics, objections, urgency changes, candidate prep tips. Examples of not useful: "sent calendar invite", "left voicemail", "forwarded CV".
- If nothing is strategically useful, return the existing notes exactly as-is. No changes.
- If something is useful, incorporate it. Do not repeat information already in the notes. Update or refine where the new intel supersedes old.
- The output is an exec-style one-pager: concise, dense, recruiter-facing. Covers: what this client values in candidates, how to pitch them, relationship context, key contacts and their preferences, hiring patterns, any prep tips for candidates going to interview.
- Plain English. Short sentences. 200-300 words maximum.
- Do not use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.
- Return only the strategy notes text. No preamble, no explanation, no labels.`
    : `You are a recruiting intelligence system. A recruiter has just logged their first activity with ${companyName}, a client of a Japan bilingual recruitment agency.

NEW ACTIVITY LOG:
${newIntel}

Rules:
- If the log contains anything strategically useful about this client, write initial strategy notes.
- If the log is purely logistical ("sent calendar invite", "left voicemail"), return exactly: UNCHANGED
- Useful strategy notes cover: what this client values in candidates, how to pitch them, relationship context, any candidate prep tips.
- Plain English. Short sentences. 150-200 words maximum.
- Do not use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.
- Return only the strategy notes text. No preamble, no explanation, no labels.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
  if (!text) return res.status(200).json({ error: "Could not update strategy notes. Try again." });

  // Model signalled nothing useful to add
  if (text === "UNCHANGED") return res.status(200).json({ unchanged: true });

  // Save directly — no preview step
  const { error: saveError } = await supabase
    .from("clients")
    .update({ strategy_notes: text })
    .eq("id", client_id);

  if (saveError) {
    console.error("[update-client-strategy] save error:", saveError.message);
    return res.status(200).json({ error: "Failed to save strategy notes." });
  }

  return res.status(200).json({ strategy_notes: text });
}
