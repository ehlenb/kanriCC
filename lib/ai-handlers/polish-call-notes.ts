import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.json({ error: "Method not allowed" });

  const { raw_notes, candidate_name } = req.body as {
    raw_notes: string;
    candidate_name?: string;
  };

  if (!raw_notes?.trim()) return res.json({ error: "No notes provided" });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const prompt = `You are a recruiting assistant. A recruiter just finished a phone call${candidate_name ? ` with ${candidate_name}` : ""} and typed these raw notes in real time:

---
${raw_notes.trim()}
---

Rewrite these notes into a clean, structured call summary. Keep all facts exactly as stated. Do not add information that is not in the notes. Do not infer or speculate.

Format the output as clear prose with a brief summary sentence first, then bullet points for any specific details, commitments, or next steps. Use plain English. Short sentences. No jargon. No em dashes.

Output only the polished notes. No preamble.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    return res.json({ data: { polished: text } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return res.json({ error: msg });
  }
}
