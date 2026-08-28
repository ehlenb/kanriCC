-- Migration 061: structured candidate buy-in tracking.
--
-- Buy-in (candidate consent to be submitted to a client for a specific role) was
-- tracked only as a pipeline position (processes.stage = 'Buy-In'), stamped on
-- stage entry. This adds a deliberate per-interaction flag and derives the
-- process-level buy-in state from it, so buy-in is a recorded fact (which
-- activity, when, how) rather than a stage someone remembered to move.
--
-- Also adds interactions.graph_message_id (dedup key for the Outlook inbound
-- poller) and the outlook_inbound_state table (poller cursor).

-- ── interactions ────────────────────────────────────────────────────────────
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS is_buy_in boolean NOT NULL DEFAULT false;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS graph_message_id text;

CREATE INDEX IF NOT EXISTS idx_interactions_buy_in
  ON interactions (process_id) WHERE is_buy_in;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_graph_message_id
  ON interactions (recruiter_id, graph_message_id) WHERE graph_message_id IS NOT NULL;

-- ── processes ───────────────────────────────────────────────────────────────
ALTER TABLE processes ADD COLUMN IF NOT EXISTS buy_in_interaction_id uuid
  REFERENCES interactions(id) ON DELETE SET NULL;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS buy_in_method text;
-- processes.buy_in_confirmed_at already exists (migration 008-era). It is now
-- trigger-synced from the earliest is_buy_in interaction; existing values are
-- left untouched by this migration.

-- ── trigger: keep processes.buy_in_* synced from is_buy_in interactions ──────
CREATE OR REPLACE FUNCTION sync_process_buy_in()
RETURNS trigger AS $$
DECLARE
  pid uuid;
  pids uuid[];
BEGIN
  pids := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.process_id END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.process_id END
    ]) AS x WHERE x IS NOT NULL
  );

  FOREACH pid IN ARRAY pids LOOP
    UPDATE processes p SET
      buy_in_interaction_id = sub.id,
      buy_in_method = sub.method,
      buy_in_confirmed_at = sub.interacted_at
    FROM (
      SELECT i.id, i.interacted_at,
        CASE
          WHEN i.interaction_type IN ('email received', 'email') THEN 'email'
          WHEN i.interaction_type = 'call' THEN 'call'
          WHEN i.interaction_type = 'meeting' THEN 'meeting'
          ELSE 'other'
        END AS method
      FROM interactions i
      WHERE i.process_id = pid AND i.is_buy_in
      ORDER BY i.interacted_at ASC
      LIMIT 1
    ) sub
    WHERE p.id = pid;

    -- No buy-in interaction remains for this process: clear the fields.
    UPDATE processes p SET
      buy_in_interaction_id = NULL, buy_in_method = NULL, buy_in_confirmed_at = NULL
    WHERE p.id = pid
      AND NOT EXISTS (
        SELECT 1 FROM interactions i WHERE i.process_id = pid AND i.is_buy_in
      );
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_process_buy_in ON interactions;
CREATE TRIGGER trg_sync_process_buy_in
  AFTER INSERT OR DELETE OR UPDATE OF is_buy_in, process_id, interacted_at, interaction_type ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION sync_process_buy_in();

-- ── outlook_inbound_state: per-recruiter poll cursor ────────────────────────
CREATE TABLE public.outlook_inbound_state (
  recruiter_id   uuid        PRIMARY KEY REFERENCES public.recruiters(id) ON DELETE CASCADE,
  team_id        uuid        NOT NULL DEFAULT public.current_team_id() REFERENCES public.teams(id),
  delta_link     text,
  last_polled_at timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outlook_inbound_state_team_id ON public.outlook_inbound_state(team_id);

ALTER TABLE public.outlook_inbound_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outlook_inbound_state_select" ON public.outlook_inbound_state FOR SELECT
  USING (recruiter_id = (select auth.uid()));
CREATE POLICY "outlook_inbound_state_all" ON public.outlook_inbound_state FOR ALL
  USING (recruiter_id = (select auth.uid()))
  WITH CHECK (recruiter_id = (select auth.uid()));

CREATE TRIGGER outlook_inbound_state_updated_at
  BEFORE UPDATE ON public.outlook_inbound_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
