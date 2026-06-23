import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { notes } = req.body as { notes?: string };
  if (!notes?.trim()) return res.status(400).json({ error: "notes is required" });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: `You are an editor for a recruiter's activity log notes.
Rewrite the recruiter's raw notes into a clean, scannable format.

Rules:
- Keep ALL facts, names, numbers, dates, and specific details exactly as written — do not invent or omit anything
- Fix grammar, spelling, and punctuation
- Remove filler words and repetition
- Break the notes into short paragraphs by topic (company context, role details, hiring process, next steps, etc.)
- Use bold text (e.g. **Company Context**, **Role**, **Process**, **Next Steps**) to introduce each paragraph where it makes sense — never use # or ## markdown headings
- Each paragraph should be 2-5 sentences max
- Write in plain past tense
- Output only the formatted notes, nothing else`,
    messages: [{ role: "user", content: notes.trim() }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();

  return res.status(200).json({ polished: text });
}
