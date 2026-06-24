import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { interaction_id, notes, source_lang } = req.body as {
    interaction_id: string;
    notes: string;
    source_lang: "en" | "ja";
  };

  if (!interaction_id || !notes?.trim() || !source_lang) {
    return res.status(400).json({ error: "interaction_id, notes, source_lang are required" });
  }

  const target_lang = source_lang === "en" ? "ja" : "en";
  const targetName = target_lang === "ja" ? "Japanese" : "English";

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a professional translator specializing in Japanese business and recruitment content.
Translate the provided text to ${targetName}.
Return only the translated text — no explanation, no preamble, no quotes around the result.
Preserve formatting: keep line breaks and **bold** markers exactly as they appear.
Use natural professional tone appropriate for Japan's business culture.
If the text is already in ${targetName}, return it unchanged.`,
      messages: [{ role: "user", content: notes.trim() }],
    });

    const translated = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase
      .from("interactions")
      .update({ full_notes_translated: translated, translated_lang: target_lang })
      .eq("id", interaction_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("translate-interaction error:", err);
    return res.status(200).json({ error: "translation failed" });
  }
}
