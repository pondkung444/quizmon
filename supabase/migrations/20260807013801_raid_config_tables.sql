create table public.raid_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_th text not null,
  description_th text,
  background_path text,
  obstacle_count int not null,
  boss_threshold_pct numeric not null,
  boss_question_count int not null default 5,
  boss_pass_count int not null default 3,
  color_quota jsonb not null,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.raid_obstacles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_th text not null,
  stat text not null check (stat in ('hp','atk','def','spd','foc')),
  reveal_th text not null,
  text_pass_roll_th text not null,
  text_pass_quiz_th text not null,
  text_fail_th text not null,
  is_active boolean not null default true
);

create table public.raid_gear_qualities (
  code text primary key,
  label_th text,
  main_value int not null,
  sub_value int,
  sort_order int not null
);

create table public.raid_quality_thresholds (
  id uuid primary key default gen_random_uuid(),
  raid_type_id uuid references public.raid_types(id) on delete cascade,
  min_score_pct numeric not null,
  quality_code text not null references public.raid_gear_qualities(code)
);

alter table public.raid_types enable row level security;
alter table public.raid_obstacles enable row level security;
alter table public.raid_gear_qualities enable row level security;
alter table public.raid_quality_thresholds enable row level security;

create policy "raid_types: select all" on public.raid_types for select using (true);
create policy "raid_obstacles: select all" on public.raid_obstacles for select using (true);
create policy "raid_gear_qualities: select all" on public.raid_gear_qualities for select using (true);
create policy "raid_quality_thresholds: select all" on public.raid_quality_thresholds for select using (true);
