-- Migration 055: interaction retrieval (post-Wave-6 substrate work)
--
-- Finding, from the August 2026 open-source audit: Kanri's densest content --
-- hundreds of interaction notes a month, in Japanese and English -- has no
-- text index anywhere. Only candidates.search_text (migration 047) is
-- pgroonga-indexed, and it covers name/company/title/notes_interview/
-- notes_pitch/ai_context -- not interactions.full_notes or summary. Ask
-- Kanri (Wave 6) has nine tools and none of them can reach the timeline. A
-- recruiter asking "what did this candidate say about relocating?" gets
-- nothing today, which is a live contradiction with the memory thesis. This
-- migration is the fix: index the timeline, and add one retrieval function
-- for Ask Kanri's new search_interactions tool to call.
--
-- Deliberately lexical only, no interaction-level embeddings. pgroonga's
-- N-gram index handles Japanese/English/code-switched text in one index, and
-- the overwhelming majority of timeline questions are anchored on a concrete
-- term someone actually said. The conceptual case ("who seemed worried about
-- stability?") is already partly served by candidates.profile_embedding,
-- which is built from ai_context + notes_interview. Add a vector arm later,
-- on observed lexical-search failures, not in advance -- see the design plan
-- for the full reasoning.
--
-- transcript_raw and full_notes_translated are deliberately excluded from
-- the indexed text: transcript_raw is long and low-signal-per-byte (already
-- distilled into full_notes by process-transcript.ts), and indexing a cached
-- translation alongside its Japanese original would double-count the same
-- statement and skew ranking toward whichever notes happen to have been
-- translated.
--
-- Also fixes a latent bug found while designing this: match_candidates_hybrid
-- (047) passes raw, uncontrolled text (JD excerpts, strategic context) straight
-- into pgroonga's &@~ operator, which parses query syntax (AND/OR/-/quotes/
-- parentheses). Unbalanced parentheses or stray query syntax in a JD throws a
-- parse error, which candidate-retrieval.ts silently swallows into its
-- keyword-fallback path -- so this has been failing quietly since Wave 2.
-- pgroonga_query_escape() is the documented fix; applied here to both the new
-- function and, via CREATE OR REPLACE (same signature, no migration needed to
-- callers), the existing one.

-- ── interactions: search column + index ─────────────────────────────────────

ALTER TABLE interactions ADD COLUMN search_text text GENERATED ALWAYS AS (
  coalesce(summary, '') || ' ' || coalesce(full_notes, '')
) STORED;

CREATE INDEX interactions_search_text_pgroonga
  ON interactions USING pgroonga (search_text);

-- ── retrieval function ───────────────────────────────────────────────────────
-- team_id filtered inside the function, not left to the caller -- this runs
-- under the service-role key (Ask Kanri's tool set), which bypasses RLS, so
-- team scoping has to happen here explicitly or it does not happen at all
-- (same discipline as match_candidates_hybrid and match-sender.ts's Wave 5
-- fix). candidate_id/client_id are optional scoping filters, not identity
-- checks -- team_id is what actually enforces isolation.
--
-- is_future interactions are excluded by default: a scheduled meeting is not
-- something that happened, and narrating it as history would be a fabrication
-- the same way an unstated fact would be.
CREATE OR REPLACE FUNCTION search_interactions(
  query_text text,
  p_team_id uuid,
  p_candidate_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_since timestamptz DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  candidate_id uuid,
  client_id uuid,
  interaction_type text,
  direction text,
  interacted_at timestamptz,
  recruiter_id uuid,
  snippet text,
  score float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    i.id,
    i.candidate_id,
    i.client_id,
    i.interaction_type,
    i.direction,
    i.interacted_at,
    i.recruiter_id,
    -- Bounded snippet, not the whole note -- a transcript-derived full_notes
    -- can run to thousands of characters and this result feeds straight into
    -- a Claude tool-result block.
    left(coalesce(i.full_notes, i.summary, ''), 400) AS snippet,
    pgroonga_score(i.tableoid, i.ctid) AS score
  FROM interactions i
  WHERE i.team_id = p_team_id
    AND i.is_future = false
    AND query_text IS NOT NULL
    AND query_text <> ''
    AND i.search_text &@~ pgroonga_query_escape(query_text)
    AND (p_candidate_id IS NULL OR i.candidate_id = p_candidate_id)
    AND (p_client_id IS NULL OR i.client_id = p_client_id)
    AND (p_since IS NULL OR i.interacted_at >= p_since)
  ORDER BY score DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION search_interactions(text, uuid, uuid, uuid, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_interactions(text, uuid, uuid, uuid, timestamptz, int) TO service_role;

-- ── fix: escape query text in the existing candidate hybrid-retrieval fn ────
-- Same signature as 047 -- CREATE OR REPLACE, no caller changes needed.
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
      AND c.search_text &@~ pgroonga_query_escape(query_text)
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
