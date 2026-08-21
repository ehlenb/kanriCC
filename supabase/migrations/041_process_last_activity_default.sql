-- Migration 041: default processes.last_activity_at to creation time
-- Closes the "phantom priority action" bug at the schema level: a process
-- could previously be created (via any code path — UI, import, future
-- features) with last_activity_at left NULL, which the dashboard's stale-touch
-- rule reads as "999 days since contact" and flags as going cold, even though
-- nothing had actually happened yet. Defaulting to now() means a freshly
-- created process is never mistaken for a stale one.

ALTER TABLE processes ALTER COLUMN last_activity_at SET DEFAULT now();

UPDATE processes
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;
