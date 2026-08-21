-- Migration 037: import_batches, import_batch_items
-- Tracks bulk CSV imports (clients, requisitions, candidates, processes) for
-- pilot onboarding migration off an incumbent ATS. Enables rollback of a
-- bad import by deleting the rows it created.

create table if not exists import_batches (
  id           uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references auth.users(id),
  team_id      uuid not null references teams(id) on delete cascade,
  entity_type  text not null
               check (entity_type in ('clients', 'requisitions', 'candidates', 'processes')),
  source_name  text,
  row_count    int not null default 0,
  status       text not null default 'committed'
               check (status in ('committed', 'rolled_back')),
  created_at   timestamptz not null default now()
);

create table if not exists import_batch_items (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references import_batches(id) on delete cascade,
  entity_id  uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists import_batch_items_batch_id_idx on import_batch_items(batch_id);

alter table import_batches enable row level security;
alter table import_batch_items enable row level security;

create policy "team members can read import batches"
  on import_batches for select
  using (team_id = (select team_id from recruiters where id = auth.uid()));

create policy "recruiter can insert import batch"
  on import_batches for insert
  with check (recruiter_id = auth.uid());

create policy "recruiter can update own import batch"
  on import_batches for update
  using (recruiter_id = auth.uid());

create policy "team members can read import batch items"
  on import_batch_items for select
  using (
    batch_id in (
      select id from import_batches
      where team_id = (select team_id from recruiters where id = auth.uid())
    )
  );

-- Inserts to import_batch_items happen via service role in the import
-- handler alongside the entity rows themselves; no insert policy needed
-- for the client.
