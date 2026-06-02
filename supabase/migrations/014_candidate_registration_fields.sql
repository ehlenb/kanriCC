-- 014 — candidate registration fields
-- Adds address (contact detail from reg form) and notes_template (TipTap rich text)

alter table candidates add column if not exists address text;
alter table candidates add column if not exists notes_template text;
