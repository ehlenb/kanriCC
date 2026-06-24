-- Store pre-translated notes so language toggle is instant with no API call
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS full_notes_translated text,
  ADD COLUMN IF NOT EXISTS translated_lang text CHECK (translated_lang IN ('en', 'ja'));
