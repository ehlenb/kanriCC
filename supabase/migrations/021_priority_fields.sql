-- 021_priority_fields.sql
-- Adds fields needed for the revised dashboard priority framework.

-- Placement start date (drives guarantee follow-up cadence)
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS start_date date;

-- Candidate declined to apply to this specific role
-- Recruiter marks this to remove candidate from buy-in priority list
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS not_interested_at timestamptz;

-- Future / scheduled events in the interaction log
-- scheduled_at: when the event is set to happen
-- is_future: true = upcoming event, false = past (default)
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_future boolean NOT NULL DEFAULT false;

-- Expand interaction_type to include 'interview scheduled'
ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_interaction_type_check;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_interaction_type_check
  CHECK (interaction_type IN (
    'call',
    'email',
    'meeting',
    'note',
    'job spec sent',
    'linkedin message',
    'interview scheduled',
    'cv sent',
    'other'
  ));
