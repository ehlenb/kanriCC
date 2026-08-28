-- Gmail integration removed from the platform - Outlook is the only email provider.
-- Zero 'gmail' rows exist. Tighten the provider CHECK so a stale Gmail path cannot
-- write one.
DELETE FROM recruiter_oauth_tokens WHERE provider = 'gmail';
ALTER TABLE recruiter_oauth_tokens DROP CONSTRAINT IF EXISTS recruiter_oauth_tokens_provider_check;
ALTER TABLE recruiter_oauth_tokens ADD CONSTRAINT recruiter_oauth_tokens_provider_check
  CHECK (provider = 'outlook');
