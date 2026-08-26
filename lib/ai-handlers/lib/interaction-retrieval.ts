// Interaction retrieval (migration 055, post-Wave-6). Ask Kanri's tool set
// (Wave 6) has nine tools and none of them can reach interactions.full_notes
// -- Kanri's densest content, hundreds of notes a month, has no text index
// and no way to be searched. This is the fix: a thin wrapper over the
// search_interactions() SQL function, mirroring candidate-retrieval.ts's
// shape and its team-scoping discipline.
//
// Lexical only, no embeddings -- see migration 055's header comment for the
// reasoning (pgroonga's N-gram index already handles Japanese/English/
// code-switched text, and the conceptual-query case is already partly served
// by candidates.profile_embedding). Add a vector arm later if real usage
// shows lexical search failing on conceptual questions, not in advance.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type InteractionSearchResult = {
  id: string;
  candidate_id: string | null;
  client_id: string | null;
  interaction_type: string;
  direction: string | null;
  interacted_at: string;
  recruiter_id: string;
  snippet: string;
};

type RetrieveParams = {
  teamId: string;
  query: string;
  candidateId?: string;
  clientId?: string;
  since?: string;
  limit?: number;
};

export async function retrieveInteractions(params: RetrieveParams): Promise<InteractionSearchResult[]> {
  const { teamId, query, candidateId, clientId, since, limit } = params;

  // Server-clamped -- a tool-calling model asking for an unbounded result set
  // is a cost and context-window risk, not a legitimate use case.
  const boundedLimit = Math.min(Math.max(limit ?? 10, 1), 25);

  const { data, error } = await supabase.rpc("search_interactions", {
    query_text: query,
    p_team_id: teamId,
    p_candidate_id: candidateId ?? null,
    p_client_id: clientId ?? null,
    p_since: since ?? null,
    p_limit: boundedLimit,
  });

  if (error) {
    console.warn(`[interaction-retrieval] search_interactions failed: ${error.message}`);
    return [];
  }

  return (data ?? []) as InteractionSearchResult[];
}
