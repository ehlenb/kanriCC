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
    ? `You are a recruiting intelligence system. A recruiter has just logged new notes from a client meeting with ${companyName}. Incorporate this new information into the existing strategy notes and return an updated, consolidated brief.

EXISTING STRATEGY NOTES:
${existing}

NEW MEETING INTEL:
${newIntel}

Rules:
- Preserve all accurate information from the existing notes
- Add, update, or refine based on the new intel — do not repeat the same point twice
- Write as a living brief, not a chronological log. No bullet point for each meeting.
- Cover: hiring needs, company culture context, how to position candidates to this client, relationship notes, key contacts and their preferences, any objections or sensitivities
- Plain English. Short sentences. Non-native speakers will read this.
- Maximum 300 words
- Do not use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.
- Return only the updated strategy notes text. No preamble, no headings, no labels.`
    : `You are a recruiting intelligence system. A recruiter has just logged notes from their first meeting with ${companyName}. Write initial strategy notes for this client account.

MEETING NOTES:
${newIntel}

Rules:
- Synthesize into a useful brief a recruiter can reference before future conversations
- Cover what was learned: hiring needs, company culture, how to position candidates, any relationship context
- Plain English. Short sentences.
- Maximum 200 words
- Do not use: straightforward, genuinely, honestly, leverage (as a verb), utilize. No em dashes.
- Return only the strategy notes text. No preamble, no headings, no labels.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
  if (!text) return res.status(200).json({ error: "Could not update strategy notes. Try again." });

  return res.status(200).json({ strategy_notes: text });
}
