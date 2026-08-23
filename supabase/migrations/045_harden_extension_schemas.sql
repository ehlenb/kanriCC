-- Migration 045: move vector into the extensions schema
-- Matches this project's existing convention (pgcrypto, uuid-ossp already live
-- there) and clears one of the three Supabase security-linter warnings raised
-- by migration 044. pgroonga and pg_net both declared relocatable = false in
-- their control files (pg_net fixes its functions in its own `net` schema by
-- design; pgroonga's index access method is schema-fixed) and cannot be
-- moved. Both WARNs are accepted as inherent to those extensions, not fixable
-- without dropping and recreating them. Safe to move vector now because
-- nothing yet depends on public.vector -- it was installed in this same
-- session with no tables using it yet.

ALTER EXTENSION vector SET SCHEMA extensions;
