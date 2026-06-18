-- 024: Add CCM1-CCM6 as valid interaction types. Keep 'interview scheduled' for
-- backward compatibility (existing rows), but it is removed from the UI.
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
    'other',
    'ccm1', 'ccm2', 'ccm3', 'ccm4', 'ccm5', 'ccm6'
  ));
