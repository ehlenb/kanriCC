-- Migration 049: structural link between a backfill requisition and the one it replaces
--
-- is_backfill has existed on requisitions since early on (read to render a
-- "Backfill"/"Net new" badge) but was never writable through the "Add job"
-- form -- only through CSV import -- and had no link back to which
-- requisition it was actually backfilling. A recruiter opening a fresh
-- requisition after a placement had no structured way to say "this replaces
-- that one." Each requisition remains exactly one seat: a backfill is
-- always a new requisition row, never the old one reopened.

ALTER TABLE requisitions
  ADD COLUMN backfill_of_requisition_id uuid REFERENCES requisitions(id) ON DELETE SET NULL;
