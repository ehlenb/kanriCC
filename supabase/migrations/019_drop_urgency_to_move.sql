-- Backfill active_passive from legacy urgency_to_move data where not already set
UPDATE candidates
SET active_passive = CASE
  WHEN urgency_to_move = 'High' THEN 'Active'
  ELSE 'Passive'
END
WHERE urgency_to_move IS NOT NULL
  AND active_passive IS NULL;

-- Drop the now-redundant column
ALTER TABLE candidates DROP COLUMN IF EXISTS urgency_to_move;
