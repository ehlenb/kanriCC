/**
 * One-off backfill: computes candidates.profile_embedding for every
 * candidate that doesn't have one yet. Needed because embedding generation
 * (lib/ai-handlers/refresh-context.ts) only runs when a candidate's context
 * refreshes -- new interactions trigger it automatically, but existing seed
 * candidates with no fresh interaction never pass through that path.
 *
 * Requires VOYAGE_API_KEY in .env. Run with: npx tsx scripts/backfill-candidate-embeddings.ts
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { embedTexts, toVectorLiteral } from "../lib/embeddings.js";

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BATCH_SIZE = 100; // Voyage accepts up to 128 texts per call

type CandidateRow = {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  japanese_level: string | null;
  english_level: string | null;
  ai_context: string | null;
  notes_interview: string | null;
};

function buildEmbeddingInput(c: CandidateRow): string {
  return `${c.full_name}. ${c.current_title ?? ""} at ${c.current_company ?? ""}. Japanese ${c.japanese_level ?? "—"}, English ${c.english_level ?? "—"}.
${c.ai_context ?? ""}
${c.notes_interview ?? ""}`.trim();
}

async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    console.error("VOYAGE_API_KEY is not set in .env -- nothing to do.");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("candidates")
    .select("id, full_name, current_title, current_company, japanese_level, english_level, ai_context, notes_interview")
    .is("profile_embedding", null);

  if (error) throw error;

  const candidates = (data ?? []) as CandidateRow[];
  console.log(`${candidates.length} candidates missing profile_embedding.`);
  if (candidates.length === 0) return;

  let done = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const embeddings = await embedTexts(batch.map(buildEmbeddingInput), "document");

    await Promise.all(
      batch.map((c, j) => {
        const embedding = embeddings[j];
        if (!embedding) {
          console.warn(`  skipped ${c.full_name} (${c.id}) -- embedding call failed`);
          return Promise.resolve();
        }
        return supabase
          .from("candidates")
          .update({ profile_embedding: toVectorLiteral(embedding) })
          .eq("id", c.id);
      }),
    );

    done += batch.length;
    console.log(`  processed ${done} / ${candidates.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
