-- Migration 030: recall_bot_sessions
-- Tracks Recall.ai note-taker bots per candidate meeting.

create table if not exists recall_bot_sessions (
  id           uuid primary key default gen_random_uuid(),
  bot_id       text not null unique,
  candidate_id uuid not null references candidates(id) on delete cascade,
  recruiter_id uuid not null references auth.users(id),
  team_id      uuid not null references teams(id) on delete cascade,
  meeting_url  text not null,
  status       text not null default 'invited'
               check (status in ('invited', 'in_progress', 'done', 'failed')),
  created_at   timestamptz not null default now()
);

alter table recall_bot_sessions enable row level security;

create policy "team members can read bot sessions"
  on recall_bot_sessions for select
  using (team_id = (select team_id from recruiters where id = auth.uid()));

create policy "recruiter can insert bot session"
  on recall_bot_sessions for insert
  with check (recruiter_id = auth.uid());

-- Webhook updates via service role bypass RLS; no policy needed for update.
-- Service role key is used in the webhook handler.
