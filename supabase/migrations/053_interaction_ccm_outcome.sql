-- Wave 4, piece 2: persist the CCM round verdict on the interaction row
-- itself, since processes.ccm_outcome is a single mutable slot that gets
-- nulled by useStageChange the moment the process advances to the next
-- round (candidates.$id.tsx). The interaction row for that round already
-- exists, already carries the debrief notes, and is reliably linked via
-- process_id -- it's the right permanent anchor for the verdict.
ALTER TABLE interactions
  ADD COLUMN ccm_outcome text CHECK (ccm_outcome IN ('pass', 'fail'));
