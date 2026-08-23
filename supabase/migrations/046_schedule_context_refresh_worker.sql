-- Migration 046: schedule the automatic memory-refresh worker
--
-- The infrastructure from migration 044 has been deployed and verified live
-- (worker endpoint confirmed reachable at the production URL, correctly
-- authenticates, and successfully refreshes a real candidate's ai_context).
-- This migration turns it on: from here, logging any interaction
-- automatically refreshes that candidate/client/requisition's memory within
-- about a minute, with no button press required.

SELECT cron.schedule(
  'process-context-refresh-queue',
  '* * * * *',
  $$SELECT util.process_context_refresh_queue();$$
);
