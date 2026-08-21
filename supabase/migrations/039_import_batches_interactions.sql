-- Migration 039: allow 'interactions' as an import_batches.entity_type
-- Extends the CSV import feature to populate candidate/client timelines
-- alongside the pipeline data brought in by 037/038.

ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_entity_type_check;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_entity_type_check
  CHECK (entity_type IN ('clients', 'contacts', 'requisitions', 'candidates', 'processes', 'interactions'));
