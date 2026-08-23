-- Migration 044: automatic memory refresh (Memory Doctrine, CLAUDE.md §2)
--
-- Until now, ai_context (candidates/clients/requisitions) only updated when a
-- recruiter clicked a "Refresh" button. Memory that only updates when someone
-- remembers to press a button is not memory — it is stale by default. This
-- migration makes refresh a consequence of logging an interaction, using an
-- in-database job queue so a burst of Claude calls never blocks the interaction
-- insert the recruiter is waiting on.
--
-- Architecture (matches Supabase's own "Automatic Embeddings" pattern):
--   interaction inserted
--     -> trigger enqueues a job in pgmq (deduped per entity)
--     -> pg_cron drains the queue every minute
--     -> pg_net calls POST /api/jobs?type=process-refresh-queue (async, non-blocking)
--     -> the worker calls the existing refresh-context logic and, on success,
--        deletes the job. On failure the job's pgmq visibility timeout expires
--        and it is retried automatically on the next tick.
--
-- This migration creates the extensions, queue, trigger, and worker function.
-- It deliberately does NOT schedule the pg_cron job yet — that happens in
-- 046_schedule_context_refresh_worker.sql, once the Vercel endpoint this
-- worker calls has been deployed and manually verified. Until 046 runs, jobs
-- will queue up harmlessly and be drained as soon as the schedule starts.
--
-- Requires two Vault secrets to be set (not committed to git, see session notes):
--   app_base_url          — the deployed Kanri app's base URL
--   internal_job_secret   — shared secret the worker endpoint checks via the
--                            x-internal-secret header (env var INTERNAL_JOB_SECRET)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS util;

-- Idempotent queue creation — pgmq.create() errors if the queue already exists.
DO $$
BEGIN
  PERFORM pgmq.create('context_refresh_jobs');
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

GRANT USAGE ON SCHEMA pgmq TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq TO authenticated, service_role;
GRANT SELECT ON pgmq.q_context_refresh_jobs TO authenticated, service_role;

-- ── Trigger: enqueue a refresh job on interaction insert ──────────────────────
-- One interaction can touch up to three entities (candidate, client,
-- requisition) if all three are linked. Each gets its own job. Deduped against
-- the queue's currently-unprocessed messages so a burst of activity for the
-- same entity within one drain cycle produces exactly one Claude call, not one
-- per interaction. Skips is_future interactions (scheduled, not yet happened),
-- matching the convention in migrations 040/042.
--
-- SAFETY: the whole body is wrapped so that ANY failure here (queue not yet
-- permissioned, pgmq hiccup, anything) is caught and logged as a warning
-- rather than propagated. Logging an interaction must never fail because a
-- background memory-refresh queue had a problem.
CREATE OR REPLACE FUNCTION util.enqueue_context_refresh()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_future IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.candidate_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pgmq.q_context_refresh_jobs
    WHERE (message->>'entity_type') = 'candidate'
      AND (message->>'entity_id') = NEW.candidate_id::text
  ) THEN
    PERFORM pgmq.send('context_refresh_jobs', jsonb_build_object(
      'entity_type', 'candidate',
      'entity_id', NEW.candidate_id,
      'triggered_by_interaction_id', NEW.id
    ));
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pgmq.q_context_refresh_jobs
    WHERE (message->>'entity_type') = 'client'
      AND (message->>'entity_id') = NEW.client_id::text
  ) THEN
    PERFORM pgmq.send('context_refresh_jobs', jsonb_build_object(
      'entity_type', 'client',
      'entity_id', NEW.client_id,
      'triggered_by_interaction_id', NEW.id
    ));
  END IF;

  IF NEW.requisition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pgmq.q_context_refresh_jobs
    WHERE (message->>'entity_type') = 'requisition'
      AND (message->>'entity_id') = NEW.requisition_id::text
  ) THEN
    PERFORM pgmq.send('context_refresh_jobs', jsonb_build_object(
      'entity_type', 'requisition',
      'entity_id', NEW.requisition_id,
      'triggered_by_interaction_id', NEW.id
    ));
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'enqueue_context_refresh failed for interaction %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pgmq;

DROP TRIGGER IF EXISTS trg_enqueue_context_refresh ON interactions;
CREATE TRIGGER trg_enqueue_context_refresh
  AFTER INSERT ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION util.enqueue_context_refresh();

-- ── Worker: drain the queue and dispatch to the Vercel endpoint ───────────────
-- Reads up to 10 jobs per tick with a 60-second visibility timeout (refresh
-- calls Claude and normally completes in a few seconds). pg_net is
-- fire-and-forget — durability comes from pgmq's visibility timeout, not the
-- HTTP response, so a failed or slow call simply retries on the next tick.
-- No-ops safely if the Vault secrets have not been configured yet.
CREATE OR REPLACE FUNCTION util.process_context_refresh_queue()
RETURNS void AS $$
DECLARE
  v_msg record;
  v_url text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'app_base_url';

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_job_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  FOR v_msg IN
    SELECT * FROM pgmq.read('context_refresh_jobs', 60, 10)
  LOOP
    PERFORM net.http_post(
      url := v_url || '/api/jobs?type=process-refresh-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object(
        'msg_id', v_msg.msg_id,
        'entity_type', v_msg.message->>'entity_type',
        'entity_id', v_msg.message->>'entity_id',
        'triggered_by_interaction_id', v_msg.message->>'triggered_by_interaction_id'
      ),
      timeout_milliseconds := 25000
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SET search_path = public, pgmq, net, vault;

-- ── Callback: worker deletes its own job once refresh succeeds ────────────────
-- SECURITY DEFINER so it can reach into pgmq regardless of caller, but locked
-- to service_role only — this must never be callable by a recruiter's session.
CREATE OR REPLACE FUNCTION public.complete_context_refresh_job(job_msg_id bigint)
RETURNS void AS $$
BEGIN
  PERFORM pgmq.delete('context_refresh_jobs', job_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION public.complete_context_refresh_job(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_context_refresh_job(bigint) TO service_role;
