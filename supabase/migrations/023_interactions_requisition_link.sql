-- Add optional requisition link to interactions so client-tab activities
-- can cross-reference a specific open role. Nullable — existing rows unaffected.
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES requisitions(id) ON DELETE SET NULL;
