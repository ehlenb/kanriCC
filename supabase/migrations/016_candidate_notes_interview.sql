-- 016: add notes_interview column + expand interactions type constraint

-- Add free-form interview notes field (replaces Work History section in notes tab)
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS notes_interview text;

-- Expand interaction type constraint to include types used in the UI
ALTER TABLE public.interactions DROP CONSTRAINT IF EXISTS interactions_interaction_type_check;
ALTER TABLE public.interactions ADD CONSTRAINT interactions_interaction_type_check
  CHECK (interaction_type IN ('call', 'email', 'meeting', 'note', 'job spec sent', 'linkedin message', 'other'));
