-- Add Japanese document upload fields to candidates
-- cv_url_jp_shokumu: 職務経歴書 (work history document)
-- cv_url_jp_rireki: 履歴書 (formal resume with photo/personal details)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS cv_url_jp_shokumu text,
  ADD COLUMN IF NOT EXISTS cv_url_jp_rireki text;
