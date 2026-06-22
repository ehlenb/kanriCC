-- Migration 029: recruiter_oauth_tokens
-- Stores encrypted OAuth refresh tokens per recruiter per provider.
-- One row per (recruiter_id, provider) pair.

create table if not exists recruiter_oauth_tokens (
  id                    uuid primary key default gen_random_uuid(),
  recruiter_id          uuid not null references auth.users(id) on delete cascade,
  team_id               uuid not null references teams(id) on delete cascade,
  provider              text not null check (provider in ('gmail', 'outlook')),
  email                 text not null,
  refresh_token_enc     text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(recruiter_id, provider)
);

-- RLS: team-scoped — recruiters can only see tokens in their own team
alter table recruiter_oauth_tokens enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'recruiter_oauth_tokens'
    and policyname = 'team members can view own team oauth tokens'
  ) then
    create policy "team members can view own team oauth tokens"
      on recruiter_oauth_tokens for select
      using (team_id = (select team_id from recruiters where id = auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'recruiter_oauth_tokens'
    and policyname = 'recruiter can insert own token'
  ) then
    create policy "recruiter can insert own token"
      on recruiter_oauth_tokens for insert
      with check (recruiter_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'recruiter_oauth_tokens'
    and policyname = 'recruiter can update own token'
  ) then
    create policy "recruiter can update own token"
      on recruiter_oauth_tokens for update
      using (recruiter_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'recruiter_oauth_tokens'
    and policyname = 'recruiter can delete own token'
  ) then
    create policy "recruiter can delete own token"
      on recruiter_oauth_tokens for delete
      using (recruiter_id = auth.uid());
  end if;
end $$;
