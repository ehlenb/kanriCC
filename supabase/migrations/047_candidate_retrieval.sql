-- Migration 047: retrieval layer for candidate matching (Wave 2)
--
-- advanced-search.ts and match-candidates.ts currently load the entire
-- candidates table into one Claude prompt, then arbitrarily truncate to the
-- first 50-60 rows by DB order. This does not scale past a real agency's
-- candidate count. This migration adds the two-stage retrieval substrate:
-- a stored embedding column for semantic search (pgvector, already installed
-- but unused since migration 044) and a full-text search column indexed with
-- pgroonga (not native Postgres tsvector/GIN, which cannot tokenize
-- Japanese -- see docs/kanri-substrate-audit.html section 3). The two are
-- fused with reciprocal rank fusion in a single SQL function, since Supabase
-- has no BM25 extension for the usual BM25+vector+RRF recipe.
--
-- Also promotes requisition_conditions from a two-tier (must_have/
-- nice_to_have) prompt-stuffed list into a three-tier matching spine with
-- a numeric weight, so a job requirement can be marked as a true dealbreaker
-- instead of a soft suggestion.
--
-- Embedding provider is Voyage AI (voyage-3.5, output_dimension 1024) --
-- chosen by the user, not independently validated against Kanri's actual
-- (code-switched JP/EN) content. See CLAUDE.md Wave 2 notes.

-- ── Candidate semantic + full-text search columns ──────────────────────────

ALTER TABLE candidates ADD COLUMN profile_embedding extensions.vector(1024);

CREATE INDEX candidates_profile_embedding_hnsw
  ON candidates USING hnsw (profile_embedding extensions.vector_cosine_ops);

ALTER TABLE candidates ADD COLUMN search_text text GENERATED ALWAYS AS (
  coalesce(full_name, '') || ' ' ||
  coalesce(full_name_japanese, '') || ' ' ||
  coalesce(current_company, '') || ' ' ||
  coalesce(current_title, '') || ' ' ||
  coalesce(notes_interview, '') || ' ' ||
  coalesce(notes_pitch, '') || ' ' ||
  coalesce(ai_context, '')
) STORED;

CREATE INDEX candidates_search_text_pgroonga
  ON candidates USING pgroonga (search_text);

-- ── Hybrid retrieval function ───────────────────────────────────────────────
-- Two ranked candidate lists (vector cosine distance, pgroonga full-text
-- match) fused with reciprocal rank fusion (1 / (60 + rank), summed per
-- candidate). team_id and candidate_status are filtered inside the function,
-- not left to the caller -- this runs under the service-role key, which
-- bypasses RLS, so team scoping has to happen here explicitly or it does not
-- happen at all. query_embedding may be NULL (no VOYAGE_API_KEY configured,
-- or the embedding call failed) -- the function falls back to text-only
-- ranking in that case rather than failing.
CREATE OR REPLACE FUNCTION match_candidates_hybrid(
  query_embedding extensions.vector(1024),
  query_text text,
  p_team_id uuid,
  p_statuses text[],
  p_excluded_ids uuid[],
  p_limit int DEFAULT 100
)
RETURNS TABLE(id uuid, score float)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH vector_ranked AS (
    SELECT c.id, row_number() OVER (ORDER BY c.profile_embedding <=> query_embedding) AS rnk
    FROM candidates c
    WHERE query_embedding IS NOT NULL
      AND c.profile_embedding IS NOT NULL
      AND c.team_id = p_team_id
      AND c.candidate_status = ANY(p_statuses)
      AND NOT (c.id = ANY(p_excluded_ids))
    ORDER BY c.profile_embedding <=> query_embedding
    LIMIT 200
  ),
  text_ranked AS (
    SELECT c.id, row_number() OVER (ORDER BY pgroonga_score(c.tableoid, c.ctid) DESC) AS rnk
    FROM candidates c
    WHERE query_text IS NOT NULL
      AND query_text <> ''
      AND c.search_text &@~ query_text
      AND c.team_id = p_team_id
      AND c.candidate_status = ANY(p_statuses)
      AND NOT (c.id = ANY(p_excluded_ids))
    ORDER BY pgroonga_score(c.tableoid, c.ctid) DESC
    LIMIT 200
  ),
  fused AS (
    SELECT combined.id, sum(1.0 / (60 + combined.rnk)) AS score
    FROM (
      SELECT id, rnk FROM vector_ranked
      UNION ALL
      SELECT id, rnk FROM text_ranked
    ) combined
    GROUP BY combined.id
  )
  SELECT fused.id, fused.score
  FROM fused
  ORDER BY fused.score DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION match_candidates_hybrid(extensions.vector, text, uuid, text[], uuid[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_candidates_hybrid(extensions.vector, text, uuid, text[], uuid[], int) TO service_role;

-- ── requisition_conditions: promote to a three-tier weighted matching spine ─

ALTER TABLE requisition_conditions DROP CONSTRAINT requisition_conditions_condition_type_check;
ALTER TABLE requisition_conditions ADD CONSTRAINT requisition_conditions_condition_type_check
  CHECK (condition_type = ANY (ARRAY['must_have'::text, 'nice_to_have'::text, 'dealbreaker'::text]));

ALTER TABLE requisition_conditions ADD COLUMN weight int NOT NULL DEFAULT 5 CHECK (weight BETWEEN 1 AND 10);

UPDATE requisition_conditions SET weight = CASE condition_type
  WHEN 'must_have' THEN 7
  WHEN 'nice_to_have' THEN 3
  ELSE 5
END;
