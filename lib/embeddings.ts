// Voyage AI embeddings -- chosen as Anthropic's recommended embeddings
// partner (Anthropic does not offer an embeddings endpoint itself). No SDK:
// this repo calls third-party APIs via raw fetch (see invite-recall-bot.ts),
// and Voyage's REST surface is small enough not to need one.
//
// Model choice is provisional, not independently validated: the audit in
// docs/kanri-substrate-audit.html flags that no published embedding
// benchmark covers Kanri's actual content (notes that code-switch between
// Japanese and English mid-sentence). See CLAUDE.md Wave 2 notes.
//
// VOYAGE_API_KEY is optional at the infrastructure level -- every caller
// must treat a null return as "skip this step," not an error. A missing key
// or a failed call must never break the interaction-insert path or a live
// candidate search; it should just fall back to keyword-only retrieval.

const VOYAGE_MODEL = "voyage-3.5";
const VOYAGE_OUTPUT_DIMENSION = 1024;

type VoyageInputType = "document" | "query";

type VoyageResponse = {
  data: { embedding: number[]; index: number }[];
};

export async function embedTexts(
  texts: string[],
  inputType: VoyageInputType,
): Promise<(number[] | null)[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey || texts.length === 0) {
    return texts.map(() => null);
  }

  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: VOYAGE_MODEL,
        input_type: inputType,
        output_dimension: VOYAGE_OUTPUT_DIMENSION,
      }),
    });

    if (!res.ok) {
      console.warn(`[embeddings] Voyage API returned ${res.status}: ${await res.text()}`);
      return texts.map(() => null);
    }

    const body = (await res.json()) as VoyageResponse;
    const byIndex = new Map(body.data.map((d) => [d.index, d.embedding]));
    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[embeddings] Voyage API call failed: ${message}`);
    return texts.map(() => null);
  }
}

export async function embedText(text: string, inputType: VoyageInputType): Promise<number[] | null> {
  const [result] = await embedTexts([text], inputType);
  return result;
}

// Supabase's generated types represent pgvector columns/RPC params as
// `string` (PostgREST expects the vector literal text form, e.g.
// "[0.1,0.2,...]") rather than number[]. Both the candidates.profile_embedding
// column write and the match_candidates_hybrid RPC call need this.
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
