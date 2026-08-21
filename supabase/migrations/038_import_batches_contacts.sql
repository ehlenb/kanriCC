-- Migration 038: allow 'contacts' as an import_batches.entity_type
-- Client contacts were scoped out of the initial import feature (037);
-- this adds them so a pilot can bring in client contacts alongside clients.

ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_entity_type_check;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_entity_type_check
  CHECK (entity_type IN ('clients', 'contacts', 'requisitions', 'candidates', 'processes'));
