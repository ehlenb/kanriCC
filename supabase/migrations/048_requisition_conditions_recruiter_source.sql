-- Migration 048: fix requisition_conditions.source check constraint
--
-- Pre-existing bug, unrelated to Wave 2 retrieval work, found while
-- verifying the new Dealbreaker column in ConditionsCard: the manual-add
-- insert in jobs.$id.tsx has always sent source: "recruiter", but the check
-- constraint from migration 008 only allowed 'jd' or 'client'. Every manual
-- add through this UI has failed with a 400 since it was written -- the
-- table had zero rows anywhere in the database as a result.

ALTER TABLE requisition_conditions DROP CONSTRAINT requisition_conditions_source_check;
ALTER TABLE requisition_conditions ADD CONSTRAINT requisition_conditions_source_check
  CHECK (source = ANY (ARRAY['jd'::text, 'client'::text, 'recruiter'::text]));
