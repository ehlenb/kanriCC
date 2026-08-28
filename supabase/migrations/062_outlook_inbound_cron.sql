-- Migration 062: schedule the Outlook inbound-email poller.
--
-- Every 2 minutes, pg_cron fires a fire-and-forget pg_net POST to
-- /api/jobs?type=poll-outlook-inbound (x-internal-secret header). The handler
-- iterates every recruiter with a connected Outlook mailbox, pulls messages
-- received since outlook_inbound_state.last_polled_at, matches senders against
-- the team's candidates / client contacts, and logs matches as `email received`
-- interactions. No queue -- the handler is idempotent (graph_message_id dedup)
-- so a missed or slow tick simply catches up next run.
--
-- Reuses the Vault secrets configured for migration 044 (app_base_url,
-- internal_job_secret). No-ops safely if they are not set.

CREATE OR REPLACE FUNCTION util.poll_outlook_inbound()
RETURNS void AS $$
DECLARE
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

  PERFORM net.http_post(
    url := v_url || '/api/jobs?type=poll-outlook-inbound',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END;
$$ LANGUAGE plpgsql SET search_path = public, net, vault;

SELECT cron.schedule(
  'poll-outlook-inbound',
  '*/2 * * * *',
  $$SELECT util.poll_outlook_inbound();$$
);
