import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { raw_text } = req.body as { raw_text?: string };
  if (!raw_text || raw_text.trim().length < 10) {
    return res.status(400).json({ error: "raw_text is required" });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are formatting raw notes from a recruiter registration call into clean interview notes.

The raw text below may be a CV, registration form, or pasted notes. Extract the key information and write it as structured plain-text interview notes a recruiter can read in 30 seconds.

Format rules:
- Use short sections with clear headers in capitals (e.g. BACKGROUND, CAREER HISTORY, MOTIVATIONS, KEY SKILLS)
- Each bullet should be one plain sentence. No jargon.
- Career history: list roles in order from oldest to most recent. One bullet per role. Include company, title, rough dates if available, and one sentence on what they did.
- Do not invent information that is not in the source text. If something is not mentioned, skip that section entirely.
- Do not use em dashes. Do not use the words "straightforward", "genuinely", "honestly", "leverage" or "utilize".
- Output plain text only. No markdown formatting, no asterisks, no hashes.

Raw text:
${raw_text.slice(0, 8000)}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") return res.json({ error: "Unexpected response from AI" });

    return res.json({ data: content.text.trim() });
  } catch (err) {
    console.error("format-interview-notes error:", err);
    return res.json({ error: "Could not format notes. Try again." });
  }
}
