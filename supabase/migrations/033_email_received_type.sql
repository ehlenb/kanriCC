-- Add "email received" as a valid interaction_type
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_interaction_type_check;
ALTER TABLE interactions ADD CONSTRAINT interactions_interaction_type_check
  CHECK (interaction_type IN (
    'call','email','email received','meeting','note',
    'job spec sent','linkedin message','interview scheduled','cv sent','other',
    'ccm1','ccm2','ccm3','ccm4','ccm5','ccm6'
  ));
