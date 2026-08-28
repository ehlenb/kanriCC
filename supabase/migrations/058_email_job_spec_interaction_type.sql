-- Add "email job spec sent" as a valid interaction_type.
-- Distinct from the existing "job spec sent": this one is logged when the recruiter
-- emails the JD + spec to a candidate to ask for interest/buy-in (via the candidate
-- page's Email composer, "Email Job Spec" mode).
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_interaction_type_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_interaction_type_check
  CHECK (interaction_type IN (
    'call','email','email received','meeting','note',
    'job spec sent','email job spec sent','linkedin message','interview scheduled','cv sent','other',
    'ccm1','ccm2','ccm3','ccm4','ccm5','ccm6'
  ));
