import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an editor for a Japan-market recruiter's company strategy notes.

You will receive two text blocks:
- EXISTING: the recruiter's current strategy notes (may contain their own observations and research)
- INCOMING: new AI-generated intelligence about the company

Your job: produce a single, polished paragraph that combines both. Rules:
- Remove any redundant or duplicate information — keep the most specific/accurate version
- Preserve anything from EXISTING that adds nuance or recruiter perspective not in INCOMING
- Incorporate anything genuinely new from INCOMING
- Write as flowing prose, no headers or bullet points
- Keep it concise: 120–200 words
- Do not use: straightforward, genuinely, honestly, leverage (as verb), utilize. No em dashes.
- Output only the merged paragraph — no preamble, no explanation`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { existing, incoming } = req.body as { existing: string; incoming: string };
  if (!existing || !incoming) return res.status(400).json({ error: "existing and incoming are required" });

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `EXISTING:\n${existing}\n\nINCOMING:\n${incoming}`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const merged = textBlock?.type === "text" ? textBlock.text.trim() : "";
    if (!merged) return res.status(200).json({ error: "Merge failed. Notes unchanged." });

    return res.status(200).json({ merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Merge failed";
    console.error("[merge-strategy-notes]", msg);
    return res.status(200).json({ error: msg });
  }
}
