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

  const { candidateId } = req.body as { candidateId: string };
  if (!candidateId) return res.status(400).json({ error: "Missing candidateId" });

  const { data: candidate, error: fetchErr } = await supabase
    .from("candidates")
    .select("notes_template")
    .eq("id", candidateId)
    .single();

  if (fetchErr || !candidate?.notes_template) {
    return res.status(400).json({ error: "No candidate notes found to extract from." });
  }

  // Strip HTML tags so Claude reads clean text
  const plainText = candidate.notes_template
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `You extract salary compensation data from recruiter notes. Return ONLY a valid JSON object with these keys:
- current_base: number in raw yen (e.g. 12000000 for ¥12M) or null
- current_bonus: number in raw yen or null
- current_total: number in raw yen or null
- expected_total_min: number in raw yen or null
- expected_total_max: number in raw yen or null

Rules:
- "12M", "¥12M", "12 million", "1,200万", "1200万円" all mean 12000000
- If only one expected figure is given (not a range), put it in expected_total_min only
- If the note says "base" without specifying total, put it in current_base
- Return null for any field not mentioned
- No explanation, no markdown — just the JSON object`,
    messages: [
      {
        role: "user",
        content: `Extract compensation figures from these recruiter notes:\n\n${plainText}`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  let extracted: Record<string, number | null>;
  try {
    extracted = JSON.parse(raw) as Record<string, number | null>;
  } catch {
    return res.status(500).json({ error: "AI returned unparseable response." });
  }

  // Only save fields that have values
  const toSave = Object.fromEntries(
    Object.entries(extracted).filter(([, v]) => v != null),
  );

  if (Object.keys(toSave).length === 0) {
    return res.status(200).json({ extracted: {} });
  }

  const { error: saveErr } = await supabase
    .from("candidates")
    .update(toSave)
    .eq("id", candidateId);

  if (saveErr) {
    return res.status(500).json({ error: "Failed to save extracted compensation." });
  }

  return res.status(200).json({ extracted });
}
