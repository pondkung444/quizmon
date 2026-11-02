create table public.raid_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_ref_id uuid,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_run_id uuid
);

create index raid_tickets_user_unconsumed_idx on public.raid_tickets (user_id) where consumed_at is null;
create unique index raid_tickets_source_ref_uniq
  on public.raid_tickets (source, source_ref_id) where source_ref_id is not null;

alter table public.raid_tickets enable row level security;
create policy "raid_tickets: select own" on public.raid_tickets for select using (auth.uid() = user_id);
