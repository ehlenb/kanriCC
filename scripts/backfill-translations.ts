/**
 * One-time script: translate all existing interaction notes that have no stored translation.
 * Assumes existing notes are in English (translates to Japanese).
 * Run with: npx tsx scripts/backfill-translations.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function translate(text: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `You are a professional translator specializing in Japanese business and recruitment content.
Translate the provided text to Japanese.
Return only the translated text — no explanation, no preamble, no quotes around the result.
Preserve formatting: keep line breaks and **bold** markers exactly as they appear.
Use natural professional tone appropriate for Japan's business culture.
If the text is already in Japanese, return it unchanged.`,
    messages: [{ role: "user", content: text }],
  });
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Fetch all interactions with notes but no translation
  const { data: interactions, error } = await supabase
    .from("interactions")
    .select("id, full_notes, summary")
    .not("full_notes", "is", null)
    .is("full_notes_translated", null);

  if (error) {
    console.error("Failed to fetch interactions:", error.message);
    process.exit(1);
  }

  if (!interactions || interactions.length === 0) {
    console.log("No interactions to backfill.");
    return;
  }

  console.log(`Backfilling ${interactions.length} interactions...`);

  let done = 0;
  let failed = 0;

  for (const row of interactions) {
    const notes = row.full_notes as string;
    try {
      const translated = await translate(notes);
      const { error: updateError } = await supabase
        .from("interactions")
        .update({ full_notes_translated: translated, translated_lang: "ja" })
        .eq("id", row.id);

      if (updateError) {
        console.error(`  ✗ ${row.id}: DB update failed — ${updateError.message}`);
        failed++;
      } else {
        done++;
        console.log(`  ✓ ${row.id} (${done}/${interactions.length})`);
      }
    } catch (err) {
      console.error(`  ✗ ${row.id}: translation failed —`, err);
      failed++;
    }

    // Small delay to avoid hitting rate limits
    await sleep(300);
  }

  console.log(`\nDone. ${done} translated, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
