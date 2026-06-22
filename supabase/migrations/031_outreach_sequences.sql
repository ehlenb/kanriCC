-- outreach_sequences: named reusable cadence templates
create table if not exists outreach_sequences (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  steps         jsonb not null default '[]'::jsonb,
  created_by    uuid references auth.users(id),
  team_id       uuid references teams(id),
  created_at    timestamptz not null default now()
);

alter table outreach_sequences enable row level security;

create policy "team members can read sequences"
  on outreach_sequences for select
  using (team_id = current_team_id());

create policy "team members can insert sequences"
  on outreach_sequences for insert
  with check (team_id = current_team_id());

create policy "team members can update sequences"
  on outreach_sequences for update
  using (team_id = current_team_id());

-- outreach_enrollments: a candidate enrolled in a specific sequence
create table if not exists outreach_enrollments (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid references outreach_sequences(id) on delete cascade,
  candidate_id    uuid references candidates(id) on delete cascade,
  current_step    int not null default 0,
  next_send_at    timestamptz,
  status          text not null default 'active'
                  check (status in ('active', 'paused', 'completed', 'cancelled')),
  created_by      uuid references auth.users(id),
  team_id         uuid references teams(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table outreach_enrollments enable row level security;

create policy "team members can read enrollments"
  on outreach_enrollments for select
  using (team_id = current_team_id());

create policy "team members can insert enrollments"
  on outreach_enrollments for insert
  with check (team_id = current_team_id());

create policy "team members can update enrollments"
  on outreach_enrollments for update
  using (team_id = current_team_id());

create index outreach_enrollments_candidate_id_idx on outreach_enrollments (candidate_id);
create index outreach_enrollments_next_send_at_idx on outreach_enrollments (next_send_at);
create index outreach_enrollments_status_idx on outreach_enrollments (status);
