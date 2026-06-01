-- Migration 012: three-status system + placement tracking
-- Adds placed_at, status_source, coin_icon_dismissed to candidates
-- Removes off_market status and consolidates to Active / Passive / Placed

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS placed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_source text NOT NULL DEFAULT 'ai_inferred'
    CHECK (status_source IN ('manual', 'ai_inferred')),
  ADD COLUMN IF NOT EXISTS coin_icon_dismissed boolean NOT NULL DEFAULT false;

-- Migrate off_market → passive before tightening the constraint
UPDATE candidates SET candidate_status = 'passive' WHERE candidate_status = 'off_market';

-- Replace the four-value constraint with the three-value constraint
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_candidate_status_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_candidate_status_check
  CHECK (candidate_status IN ('active', 'passive', 'placed'));

-- Backfill placed_at from the most recent placed_date on processes
UPDATE candidates c
SET placed_at = (
  SELECT MAX(placed_date)::timestamptz
  FROM processes p
  WHERE p.candidate_id = c.id
    AND p.placed_date IS NOT NULL
)
WHERE c.candidate_status = 'placed';
