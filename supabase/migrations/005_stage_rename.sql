-- ────────────────────────────────────────────────────────────────────────────
-- 005: Rename pipeline stages + add Specs Sent
-- Run in Supabase SQL editor after 004_requisition_intake.sql
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Drop existing CHECK constraint (hard-coded stage list)
ALTER TABLE processes DROP CONSTRAINT IF EXISTS processes_stage_check;

-- 2. Rename existing stage values
UPDATE processes SET stage = 'Buy-In'  WHERE stage = 'Buy-in targeting';
UPDATE processes SET stage = 'CV Sent' WHERE stage = 'Screening';
UPDATE processes SET stage = 'CCM1'    WHERE stage = '1st interview';
UPDATE processes SET stage = 'CCM2'    WHERE stage = '2nd interview';
UPDATE processes SET stage = 'CCM3'    WHERE stage = 'Final interview';
UPDATE processes SET stage = 'Placed'  WHERE stage = 'Closed won';
-- 'Offer' and 'Closed lost' stay unchanged

-- 3. Add new CHECK constraint:
--    Fixed stages + any CCM[n] pattern (CCM1 … CCMn, no upper bound)
ALTER TABLE processes ADD CONSTRAINT processes_stage_check
  CHECK (
    stage IN ('Specs Sent', 'Buy-In', 'CV Sent', 'Offer', 'Placed', 'Closed lost')
    OR stage ~ '^CCM[0-9]+$'
  );
