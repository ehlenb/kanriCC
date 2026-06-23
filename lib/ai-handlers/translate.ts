import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, target_lang } = req.body as { text: string; target_lang: "en" | "ja" };
  if (!text || !target_lang) return res.status(400).json({ error: "text and target_lang are required" });
  if (text.trim().length === 0) return res.status(200).json({ translated: text });

  const targetName = target_lang === "ja" ? "Japanese" : "English";

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a professional translator specializing in Japanese business and recruitment content.
Translate the provided text to ${targetName}.
Return only the translated text — no explanation, no preamble, no quotes around the result.
Preserve formatting: if the input has line breaks or **bold** markers, keep them exactly.
For recruitment context: use natural professional tone appropriate for Japan's business culture.
If the text is already in ${targetName}, return it unchanged.`,
      messages: [{ role: "user", content: text }],
    });

    const translated = message.content[0]?.type === "text" ? message.content[0].text.trim() : text;
    return res.status(200).json({ translated });
  } catch (err) {
    console.error("translate handler error:", err);
    return res.status(200).json({ error: "translation failed", translated: text });
  }
}
