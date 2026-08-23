// Two-stage matching, stage 1 (retrieve). advanced-search.ts and
// match-candidates.ts used to fetch every active/passive candidate in the
// team and hand the whole set to Claude -- this replaces that with a bounded,
// relevance-ranked candidate id list from the database, so the prompt Claude
// sees in stage 2 (rank) is small and already relevant regardless of how many
// candidates the team has.
//
// Retrieval itself is hybrid: pgvector cosine similarity plus pgroonga
// full-text, fused with reciprocal rank fusion inside match_candidates_hybrid
// (migration 047) -- see docs/kanri-substrate-audit.html section 11 for why
// RRF over a plain union (no BM25 extension available on Supabase, so RRF is
// the standard substitute for the usual BM25+vector+RRF hybrid recipe).
//
// Internal helper, not a new AI endpoint -- CLAUDE.md's architecture rules
// require new recruiter-facing questions to extend existing handlers rather
// than add another one; this is shared plumbing both existing handlers call.

import { createClient } from "@supabase/supabase-js";

import { embedText, toVectorLiteral } from "../../embeddings.js";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type MatchCondition = {
  condition_text: string;
  condition_type: string;
  weight: number;
};

type RetrieveParams = {
  teamId: string;
  title: string;
  jdText: string | null;
  strategicContext: string | null;
  conditions: MatchCondition[];
  statuses: string[];
  excludedIds: string[];
  limit: number;
};

function buildQueryText({ title, jdText, strategicContext, conditions }: RetrieveParams): string {
  const dealbreakers = conditions.filter((c) => c.condition_type === "dealbreaker");
  const mustHaves = conditions.filter((c) => c.condition_type === "must_have");
  const niceToHaves = conditions.filter((c) => c.condition_type === "nice_to_have");

  // Dealbreaker/must-have text repeats proportional to weight (1-10) so it
  // dominates both the embedding (nudges cosine similarity toward candidates
  // who match it) and the pgroonga side (more surface to keyword-match on).
  // Nice-to-haves appear once -- they should nudge, not dominate, retrieval.
  const weighted = [...dealbreakers, ...mustHaves]
    .flatMap((c) => Array(Math.max(1, Math.round(c.weight / 2))).fill(c.condition_text))
    .join(". ");
  const nice = niceToHaves.map((c) => c.condition_text).join(". ");

  return [title, jdText?.slice(0, 1500) ?? "", strategicContext?.slice(0, 400) ?? "", weighted, nice]
    .filter(Boolean)
    .join("\n");
}

export async function retrieveCandidateIds(params: RetrieveParams): Promise<string[]> {
  const { teamId, statuses, excludedIds, limit } = params;
  const queryText = buildQueryText(params);

  const embedding = await embedText(queryText, "query");

  const { data, error } = await supabase.rpc("match_candidates_hybrid", {
    query_embedding: embedding ? toVectorLiteral(embedding) : null,
    query_text: queryText,
    p_team_id: teamId,
    p_statuses: statuses,
    p_excluded_ids: excludedIds,
    p_limit: limit,
  });

  if (error) {
    console.warn(`[candidate-retrieval] match_candidates_hybrid failed: ${error.message}`);
  }

  if (data && data.length > 0) {
    return (data as { id: string }[]).map((row) => row.id);
  }

  // Nothing came back -- no VOYAGE_API_KEY configured, no text match, or the
  // RPC itself failed. Degrade to a bounded status-filtered fetch instead of
  // returning an empty result set.
  const { data: fallback } = await supabase
    .from("candidates")
    .select("id")
    .eq("team_id", teamId)
    .in("candidate_status", statuses)
    .limit(limit);

  const excluded = new Set(excludedIds);
  return ((fallback ?? []) as { id: string }[]).map((c) => c.id).filter((id) => !excluded.has(id));
}
