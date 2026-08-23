-- Migration 042: keep candidates.last_interaction_at in sync with interactions
-- Same bug class as migration 040 (processes.last_activity_at), but on candidates.
-- The "Last touch" filter on the Candidates page, touchTone(), and the dashboard's
-- "last-touch date older than 30 days" priority rule all read last_interaction_at,
-- but nothing was ever updating it when an interaction was logged. Every candidate
-- with real timeline history still read as having no last touch.

CREATE OR REPLACE FUNCTION sync_candidate_last_interaction()
RETURNS trigger AS $$
BEGIN
  IF NEW.candidate_id IS NOT NULL THEN
    UPDATE candidates
    SET last_interaction_at = GREATEST(COALESCE(last_interaction_at, NEW.interacted_at), NEW.interacted_at)
    WHERE id = NEW.candidate_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_candidate_last_interaction ON interactions;
CREATE TRIGGER trg_sync_candidate_last_interaction
  AFTER INSERT OR UPDATE OF interacted_at, candidate_id ON interactions
  FOR EACH ROW
  WHEN (NEW.is_future IS NOT TRUE)
  EXECUTE FUNCTION sync_candidate_last_interaction();

-- One-time backfill for candidates that already had interactions logged
UPDATE candidates c
SET last_interaction_at = latest.max_interacted_at
FROM (
  SELECT candidate_id, MAX(interacted_at) AS max_interacted_at
  FROM interactions
  WHERE candidate_id IS NOT NULL AND is_future IS NOT TRUE
  GROUP BY candidate_id
) latest
WHERE c.id = latest.candidate_id
  AND (c.last_interaction_at IS NULL OR c.last_interaction_at < latest.max_interacted_at);
