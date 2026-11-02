create table public.raid_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);

alter table public.raid_allowlist enable row level security;
create policy "raid_allowlist: select own" on public.raid_allowlist for select using (auth.uid() = user_id);

insert into public.raid_allowlist (user_id, note) values
  ('792b8e1d-410c-4158-9c62-32b437b05121', 'PonDKunG (junior) — beta tester'),
  ('b497d6dd-7300-4966-bfe4-c272aa9a1e63', 'Dawu (junior) — beta tester'),
  ('abbc806f-8da6-49b8-a655-3aeb9dcae6e8', 'ต้าอู๋ห์ (senior) — beta tester');
