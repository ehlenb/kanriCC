-- Migration 040: keep processes.last_activity_at in sync with interactions
-- The dashboard's "no contact in Nd" priority rule reads processes.last_activity_at,
-- but nothing was ever updating that column when a plain activity/interaction was
-- logged (only an explicit stage change touched it). Every process looked "999 days
-- since contact" regardless of real timeline activity.

CREATE OR REPLACE FUNCTION sync_process_last_activity()
RETURNS trigger AS $$
BEGIN
  IF NEW.process_id IS NOT NULL THEN
    UPDATE processes
    SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.interacted_at), NEW.interacted_at)
    WHERE id = NEW.process_id;
  ELSIF NEW.candidate_id IS NOT NULL THEN
    UPDATE processes
    SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.interacted_at), NEW.interacted_at)
    WHERE candidate_id = NEW.candidate_id
      AND stage NOT IN ('Closed lost', 'Placed');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_process_last_activity ON interactions;
CREATE TRIGGER trg_sync_process_last_activity
  AFTER INSERT OR UPDATE OF interacted_at, process_id, candidate_id ON interactions
  FOR EACH ROW
  WHEN (NEW.is_future IS NOT TRUE)
  EXECUTE FUNCTION sync_process_last_activity();

-- One-time backfill for processes that already had interactions logged
-- (including the just-imported mock activity) before this trigger existed.
UPDATE processes p
SET last_activity_at = latest.max_interacted_at
FROM (
  SELECT
    COALESCE(i.process_id, p2.id) AS process_id,
    MAX(i.interacted_at) AS max_interacted_at
  FROM interactions i
  JOIN processes p2 ON p2.candidate_id = i.candidate_id AND p2.stage NOT IN ('Closed lost', 'Placed')
  WHERE i.is_future IS NOT TRUE
  GROUP BY COALESCE(i.process_id, p2.id)
) latest
WHERE p.id = latest.process_id
  AND (p.last_activity_at IS NULL OR p.last_activity_at < latest.max_interacted_at);
