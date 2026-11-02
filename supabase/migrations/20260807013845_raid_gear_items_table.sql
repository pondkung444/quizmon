create table public.raid_gear_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check (slot in ('head','body','feet')),
  main_stat text not null check (main_stat in ('atk','hp','def','spd')),
  main_value int not null,
  sub_stat text check (sub_stat in ('atk','hp','def','spd')),
  sub_value int,
  quality text not null references public.raid_gear_qualities(code),
  source_run_id uuid references public.raid_runs(id),
  obtained_at timestamptz not null default now(),
  equipped_pet_id uuid references public.pets(id),
  check (sub_stat is null or sub_stat <> main_stat)
);

create unique index raid_gear_one_per_slot
  on public.raid_gear_items (equipped_pet_id, slot) where equipped_pet_id is not null;
create unique index raid_gear_no_dup_main_stat
  on public.raid_gear_items (equipped_pet_id, main_stat) where equipped_pet_id is not null;

alter table public.raid_runs
  add constraint raid_runs_gear_item_id_fkey
  foreign key (gear_item_id) references public.raid_gear_items(id);

alter table public.raid_gear_items enable row level security;
create policy "raid_gear_items: select own" on public.raid_gear_items for select using (auth.uid() = owner_user_id);
