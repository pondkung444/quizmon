-- =====================================================================================
-- SQUASH MIGRATION: reconstructs 50 migrations applied to production between
-- 2026-08-04 and 2026-08-14 that were never committed back to this repo.
--
-- WHY THIS FILE EXISTS
-- Migrations were applied directly to production (project wmndxiuqzrnqbhrznmfg) via
-- Supabase MCP during a period of solo, high-velocity work. The corresponding .sql
-- files were never committed here, so `list_migrations` (DB) and this repo drifted:
-- DB had 127 applied entries, repo had 79 files. See game-design-document-v1.0.md §8 #11.
--
-- WHAT THIS FILE IS -- AND ISN'T
-- - This is a HISTORICAL RECORD written on 2026-08-15, reconstructed from the live
--   production schema (pg_get_functiondef / information_schema / pg_policies), not
--   the original SQL that was actually run. Supabase does not retain the raw SQL of
--   migrations applied through MCP -- only the final schema state is queryable.
-- - Content = final current state of each object, not a step-by-step replay. Where a
--   table/function was touched by several of the 50 missing migrations (e.g. a table
--   created then altered twice), this file reconstructs only the FINAL definition.
-- - Per decision with ปอนด์ (2026-08-15): squash into ONE file (not 50 separate files
--   mirroring original names/order), timestamped with today's actual writing date.
-- - Data-seed / one-time-backfill migrations are recorded as COMMENTS explaining what
--   they did historically -- they are NOT re-executed by this file, because backfills
--   like pet growth stats or gear main-stat tuning were one-time operations against
--   data that has since moved on. Re-running them here would corrupt current data.
-- - This file must NEVER be applied via apply_migration. It exists only so this repo's
--   migration history matches `list_migrations` in the Supabase dashboard, one file
--   per gap. Do not run it against production, staging, or any branch with real data.
--
-- Original migration names this file stands in for (DB version -> name):
--   20260804151949 claim_dungeon_run_respect_obtainable
--   20260804155648 enable_egg4_rare_ice_bear_obtainable
--   20260807013801 raid_config_tables
--   20260807013812 raid_tickets_table
--   20260807013827 raid_runs_tables
--   20260807013845 raid_gear_items_table
--   20260807013859 raid_allowlist_table
--   20260807013927 raid_seed_data
--   20260807014001 quiz_attempts_raid_source
--   20260807014119 start_raid_run_rpc
--   20260807014255 choose_raid_path_rpc
--   20260807014315 submit_raid_obstacle_answer_rpc
--   20260807014401 raid_boss_rpcs
--   20260807014435 claim_raid_reward_rpc
--   20260807020103 fix_answer_raid_boss_answered_count
--   20260807021252 raid_rpcs_add_allowlist_guard
--   20260807022206 claim_dungeon_run_issue_raid_ticket
--   20260807032547 start_raid_run_add_is_active_check
--   20260807032553 start_dungeon_run_concurrency_guard
--   20260807062032 raid_types_add_boss_columns
--   20260807062039 raid_types_ridge_mist_naming
--   20260807062148 raid_obstacles_real_16
--   20260807062156 raid_gear_qualities_label_th
--   20260807141923 raid_ridge_mist_real_art
--   20260807145833 choose_raid_path_add_roll_scaled_fields
--   20260808105006 create_schools_picklist_table
--   20260808150004 create_zones_table
--   20260808150014 add_zone_id_to_adventure_and_raid_tables
--   20260808150034 update_claim_dungeon_run_zone_ticket
--   20260808150101 update_start_raid_run_zone_scoping
--   20260808153911 raid_gear_equip_unique_constraints
--   20260808154316 raid_gear_drop_main_stat_pool
--   20260808154324 raid_start_run_apply_gear_bonus
--   20260808154330 raid_gear_equip_unequip_rpcs
--   20260808233942 stop_food_reward_from_dungeon_claim
--   20260809101933 add_pet_growth_stats_snapshot
--   20260809102102 backfill_pet_growth_stats_snapshot (data backfill -- NOT re-run, see below)
--   20260809123321 add_pet_growth_subject_breakdown
--   20260809123412 backfill_pet_growth_subject_breakdown (data backfill -- NOT re-run, see below)
--   20260809133102 claim_dungeon_run_ticket_cap
--   20260809154725 insert_raid_types_ridge_gale_storm
--   20260810212458 raid_epic_egg_pity_system
--   20260810215155 open_raid_to_all_students
--   20260810220337 enforce_raid_level_progression_server_side
--   20260810232923 fix_raid_first_clear_check_outcome_win
--   20260811013524 start_raid_run_color_by_pass_probability (1st apply, superseded)
--   20260811013830 start_raid_run_color_by_pass_probability (2nd apply -- same function,
--                  final def below; repo's existing 20260811013645 file is a 3rd/earlier
--                  timestamp that doesn't match either DB version -- flagged in survey,
--                  left alone here since renaming it is a separate decision)
--   20260814100617 profile_friends_phase8_ranking_fix_rank_nulls
--   20260814101200 profile_friends_phase8_fix_get_my_rank_missing_row
--   20260814102339 restore_get_ranking_limit_50
-- =====================================================================================


-- =====================================================================================
-- SECTION 1: dungeon fix RPCs
-- Covers: claim_dungeon_run_respect_obtainable, claim_dungeon_run_issue_raid_ticket,
--         start_dungeon_run_concurrency_guard, stop_food_reward_from_dungeon_claim,
--         claim_dungeon_run_ticket_cap
-- Final current definitions (pulled live 2026-08-15):
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.start_dungeon_run(p_pet_id uuid, p_dungeon_type_id uuid)
 RETURNS dungeon_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_duration int;
  v_run public.dungeon_runs;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (
    select 1 from public.pets
    where id = p_pet_id and user_id = v_user_id and stage = 4 and is_active = false
  ) then
    raise exception 'Qmon ตัวนี้ยังไม่พร้อมผจญภัย (ต้องโตเต็มที่และเก็บเข้าสมุดแล้ว)';
  end if;

  if exists (select 1 from public.dungeon_runs where user_id = v_user_id and status = 'in_progress') then
    raise exception 'มีการผจญภัยที่ยังไม่จบอยู่ ทำให้จบก่อนเริ่มรอบใหม่';
  end if;

  select duration_minutes into v_duration
  from public.dungeon_types
  where id = p_dungeon_type_id and is_active = true;

  if v_duration is null then
    raise exception 'ไม่พบดันเจี้ยนนี้ หรือดันเจี้ยนปิดใช้งานอยู่';
  end if;

  insert into public.dungeon_runs (user_id, pet_id, dungeon_type_id, ends_at)
  values (v_user_id, p_pet_id, p_dungeon_type_id, now() + (v_duration || ' minutes')::interval)
  returning * into v_run;

  return v_run;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_dungeon_run(p_run_id uuid)
 RETURNS TABLE(egg_awarded boolean, egg_type_id text, egg_name_th text, egg_sprite_prefix text, food_kind text, pity_meter integer, ticket_awarded boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_reward_tier text;
  v_zone_id uuid;
  v_meter int;
  v_egg_awarded boolean := false;
  v_egg_type_id text;
  v_ticket_awarded boolean := false;
  v_ticket_count int;
  v_ticket_cap constant int := 10;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_run
  from public.dungeon_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการผจญภัยนี้';
  end if;

  if v_run.claimed_at is not null then
    raise exception 'เคลมรางวัลไปแล้ว';
  end if;

  if v_run.ends_at > now() then
    raise exception 'การผจญภัยยังไม่เสร็จ';
  end if;

  select reward_tier, zone_id into v_reward_tier, v_zone_id
  from public.dungeon_types where id = v_run.dungeon_type_id;

  insert into public.dungeon_pity (user_id, reward_tier, meter)
  values (v_user_id, v_reward_tier, 0)
  on conflict (user_id, reward_tier) do nothing;

  select meter into v_meter
  from public.dungeon_pity
  where user_id = v_user_id and reward_tier = v_reward_tier
  for update;

  -- 20260804151949 claim_dungeon_run_respect_obtainable: only draw from eggs that are
  -- currently is_obtainable=true, otherwise raise instead of awarding an unreleased egg.
  if v_meter >= 14 then
    v_egg_awarded := true;
  elsif random() < 0.05 then
    v_egg_awarded := true;
  end if;

  if v_egg_awarded then
    select id into v_egg_type_id
    from public.egg_types
    where tier = v_reward_tier
      and is_obtainable = true
    order by random()
    limit 1;

    if v_egg_type_id is null then
      raise exception 'ตอนนี้ยังไม่เปิดให้ได้ไข่รางวัลจากดันเจี้ยนนี้ ลองรับของอีกครั้งภายหลัง';
    end if;

    insert into public.player_eggs (user_id, egg_type_id, source)
    values (v_user_id, v_egg_type_id, 'dungeon_reward');

    update public.dungeon_pity set meter = 0
    where user_id = v_user_id and reward_tier = v_reward_tier;
    v_meter := 0;
  else
    update public.dungeon_pity set meter = meter + 1
    where user_id = v_user_id and reward_tier = v_reward_tier
    returning meter into v_meter;
  end if;

  -- 20260808233942 stop_food_reward_from_dungeon_claim: food_kind is always returned
  -- null now -- dungeon claims stopped granting food (see player_food/pet_feedings
  -- system instead). Column kept on dungeon_runs/return signature for compatibility.
  update public.dungeon_runs
  set status = 'claimed',
      claimed_at = now(),
      egg_awarded = v_egg_awarded,
      egg_type_id = v_egg_type_id
  where id = p_run_id;

  -- 20260807022206 claim_dungeon_run_issue_raid_ticket +
  -- 20260808150034 update_claim_dungeon_run_zone_ticket +
  -- 20260809133102 claim_dungeon_run_ticket_cap:
  -- every claimed adventure also grants a raid ticket for that dungeon's zone, capped
  -- at 10 unconsumed tickets per user so tickets can't stockpile indefinitely.
  select count(*) into v_ticket_count
  from public.raid_tickets
  where user_id = v_user_id and consumed_at is null;

  if v_ticket_count < v_ticket_cap then
    insert into public.raid_tickets (user_id, source, source_ref_id, zone_id)
    values (v_user_id, 'dungeon_claim', p_run_id, v_zone_id)
    on conflict do nothing;
    v_ticket_awarded := true;
  end if;

  return query
  select v_egg_awarded, v_egg_type_id, e.name_th, e.sprite_prefix, null::text as food_kind, v_meter, v_ticket_awarded
  from (select 1) as _dummy
  left join public.egg_types e on e.id = v_egg_type_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_dungeon_bonus(p_run_id uuid, p_correct_count integer DEFAULT NULL::integer)
 RETURNS dungeon_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.dungeon_runs;
  v_correct_count int;
  v_clamped int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select count(*) filter (where is_correct) into v_correct_count
  from public.quiz_attempts
  where dungeon_run_id = p_run_id
    and user_id = v_user_id
    and source = 'dungeon_bonus';

  v_clamped := greatest(0, least(5, coalesce(v_correct_count, 0)));

  update public.dungeon_runs
  set ends_at = greatest(now(), ends_at - (v_clamped * 12 || ' minutes')::interval),
      bonus_quiz_used = true,
      bonus_minutes_saved = v_clamped * 12
  where id = p_run_id
    and user_id = v_user_id
    and bonus_quiz_used = false
  returning * into v_run;

  if not found then
    raise exception 'ไม่พบการผจญภัยนี้ หรือใช้คำถามโบนัสไปแล้ว';
  end if;

  return v_run;
end;
$function$;

-- 20260804155648 enable_egg4_rare_ice_bear_obtainable (data toggle, idempotent to re-state):
update public.egg_types set is_obtainable = true where id = 'egg4';


-- =====================================================================================
-- SECTION 2: zones + schools tables
-- Covers: 20260808105006 create_schools_picklist_table, 20260808150004 create_zones_table
-- =====================================================================================

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_th text not null,
  description_th text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.zones enable row level security;

drop policy if exists "zones: select all" on public.zones;
create policy "zones: select all"
  on public.zones for select
  using (true);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.schools enable row level security;

drop policy if exists "schools: read all" on public.schools;
create policy "schools: read all"
  on public.schools for select
  using (true);

drop policy if exists "schools: insert new" on public.schools;
create policy "schools: insert new"
  on public.schools for insert
  with check (
    length(trim(name)) >= 2 and length(trim(name)) <= 100
  );

-- Seed: the one live zone (id preserved from production for cross-reference)
insert into public.zones (id, slug, name_th, description_th, sort_order, is_active)
values ('23b82842-5b61-42c6-8ba1-6b9af6b34061', 'ice', 'เขตน้ำแข็ง', null, 1, true)
on conflict (id) do nothing;


-- =====================================================================================
-- SECTION 3: raid core tables
-- Covers: raid_config_tables, raid_tickets_table, raid_runs_tables, raid_gear_items_table,
--         raid_allowlist_table, raid_types_add_boss_columns, raid_types_ridge_mist_naming,
--         raid_gear_equip_unique_constraints, raid_epic_egg_pity_system,
--         raid_types_add_boss_scene_path / fill (already in repo as separate files)
-- =====================================================================================

create table if not exists public.raid_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_th text not null,
  description_th text,
  background_path text,
  obstacle_count integer not null,
  boss_threshold_pct numeric not null,
  boss_question_count integer not null default 5,
  boss_pass_count integer not null default 3,
  color_quota jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  boss_name_th text,
  boss_sprite_path text,
  zone_id uuid references public.zones(id),
  boss_scene_path text
);

comment on column public.raid_types.boss_scene_path is
  'Vertical 1080x1920 boss-fight scene background. Nullable; UI falls back to background_path (cover) until real art is supplied.';

alter table public.raid_types enable row level security;
drop policy if exists "raid_types: select all" on public.raid_types;
create policy "raid_types: select all" on public.raid_types for select using (true);

create table if not exists public.raid_obstacles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_th text not null,
  stat text not null check (stat in ('hp','atk','def','spd','foc')),
  reveal_th text not null,
  text_pass_roll_th text not null,
  text_pass_quiz_th text not null,
  text_fail_th text not null,
  is_active boolean not null default true,
  zone_id uuid references public.zones(id)
);

alter table public.raid_obstacles enable row level security;
drop policy if exists "raid_obstacles: select all" on public.raid_obstacles;
create policy "raid_obstacles: select all" on public.raid_obstacles for select using (true);

create table if not exists public.raid_gear_qualities (
  code text primary key,
  label_th text,
  main_value integer not null,
  sub_value integer,
  sort_order integer not null
);

alter table public.raid_gear_qualities enable row level security;
drop policy if exists "raid_gear_qualities: select all" on public.raid_gear_qualities;
create policy "raid_gear_qualities: select all" on public.raid_gear_qualities for select using (true);

create table if not exists public.raid_quality_thresholds (
  id uuid primary key default gen_random_uuid(),
  raid_type_id uuid references public.raid_types(id),
  min_score_pct numeric not null,
  quality_code text not null references public.raid_gear_qualities(code)
);

alter table public.raid_quality_thresholds enable row level security;
drop policy if exists "raid_quality_thresholds: select all" on public.raid_quality_thresholds;
create policy "raid_quality_thresholds: select all" on public.raid_quality_thresholds for select using (true);

create table if not exists public.raid_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  source text not null,
  source_ref_id uuid,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  consumed_run_id uuid,
  zone_id uuid not null references public.zones(id)
);

alter table public.raid_tickets enable row level security;
drop policy if exists "raid_tickets: select own" on public.raid_tickets;
create policy "raid_tickets: select own" on public.raid_tickets for select using (auth.uid() = user_id);

create table if not exists public.raid_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  pet_id uuid not null references public.pets(id),
  raid_type_id uuid not null references public.raid_types(id),
  ticket_id uuid not null references public.raid_tickets(id),
  stat_snapshot jsonb not null,
  caps_snapshot jsonb not null,
  threshold_pct numeric not null,
  gauge_max integer not null,
  phase text not null default 'choosing',
  current_step_index integer not null default 0,
  gauge_earned integer not null default 0,
  fail_count integer not null default 0,
  boss_correct_count integer not null default 0,
  outcome text,
  gear_item_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress',
  egg_awarded boolean not null default false,
  egg_type_id text
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'raid_tickets_consumed_run_id_fkey'
  ) then
    alter table public.raid_tickets
      add constraint raid_tickets_consumed_run_id_fkey
      foreign key (consumed_run_id) references public.raid_runs(id);
  end if;
end $$;

alter table public.raid_runs enable row level security;
drop policy if exists "raid_runs: select own" on public.raid_runs;
create policy "raid_runs: select own" on public.raid_runs for select using (auth.uid() = user_id);

create table if not exists public.raid_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.raid_runs(id),
  step_index integer not null,
  option_a_obstacle_id uuid not null references public.raid_obstacles(id),
  option_a_color text not null check (option_a_color in ('green','yellow','red')),
  option_b_obstacle_id uuid not null references public.raid_obstacles(id),
  option_b_color text not null check (option_b_color in ('green','yellow','red')),
  chosen_side text check (chosen_side in ('a','b')),
  chosen_at timestamptz,
  roll_threshold numeric,
  roll_value numeric,
  roll_passed boolean,
  quiz_question_id bigint references public.questions(id),
  quiz_pulled_at timestamptz,
  quiz_correct boolean,
  resolved_at timestamptz
);

alter table public.raid_run_steps enable row level security;
drop policy if exists "raid_run_steps: select own" on public.raid_run_steps;
create policy "raid_run_steps: select own" on public.raid_run_steps for select
  using (exists (select 1 from public.raid_runs r where r.id = raid_run_steps.run_id and r.user_id = auth.uid()));

create table if not exists public.raid_boss_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.raid_runs(id),
  seq integer not null,
  question_id bigint not null references public.questions(id),
  pulled_at timestamptz not null default now(),
  answered_at timestamptz,
  is_correct boolean
);

alter table public.raid_boss_questions enable row level security;
drop policy if exists "raid_boss_questions: select own" on public.raid_boss_questions;
create policy "raid_boss_questions: select own" on public.raid_boss_questions for select
  using (exists (select 1 from public.raid_runs r where r.id = raid_boss_questions.run_id and r.user_id = auth.uid()));

create table if not exists public.raid_gear_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  slot text not null check (slot in ('head','body','feet')),
  main_stat text not null check (main_stat in ('atk','hp','def','spd')),
  main_value integer not null,
  sub_stat text check (sub_stat in ('atk','hp','def','spd')),
  sub_value integer,
  quality text not null references public.raid_gear_qualities(code),
  source_run_id uuid references public.raid_runs(id),
  obtained_at timestamptz not null default now(),
  equipped_pet_id uuid references public.pets(id),
  constraint raid_gear_items_check check (sub_stat is null or sub_stat <> main_stat)
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'raid_runs_gear_item_id_fkey'
  ) then
    alter table public.raid_runs
      add constraint raid_runs_gear_item_id_fkey
      foreign key (gear_item_id) references public.raid_gear_items(id);
  end if;
end $$;

alter table public.raid_gear_items enable row level security;
drop policy if exists "raid_gear_items: select own" on public.raid_gear_items;
create policy "raid_gear_items: select own" on public.raid_gear_items for select using (auth.uid() = owner_user_id);

-- 20260808153911 raid_gear_equip_unique_constraints: a pet can only have one gear
-- piece per slot AND one gear piece per main_stat axis equipped at a time (this is
-- the "silent auto-unequip on duplicate main stat" behavior noted in project memory
-- as a deferred UX issue -- §6.5).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'raid_gear_slot_unique'
  ) then
    alter table public.raid_gear_items
      add constraint raid_gear_slot_unique unique (equipped_pet_id, slot);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'raid_gear_main_stat_unique'
  ) then
    alter table public.raid_gear_items
      add constraint raid_gear_main_stat_unique unique (equipped_pet_id, main_stat);
  end if;
end $$;

create table if not exists public.raid_allowlist (
  user_id uuid primary key references auth.users(id),
  added_at timestamptz not null default now(),
  note text
);

alter table public.raid_allowlist enable row level security;
drop policy if exists "raid_allowlist: select own" on public.raid_allowlist;
create policy "raid_allowlist: select own" on public.raid_allowlist for select using (auth.uid() = user_id);

-- 20260810212458 raid_epic_egg_pity_system
create table if not exists public.raid_pity (
  user_id uuid not null references auth.users(id),
  reward_tier text not null,
  meter integer not null default 0,
  primary key (user_id, reward_tier)
);

alter table public.raid_pity enable row level security;
drop policy if exists "raid_pity_select_own" on public.raid_pity;
create policy "raid_pity_select_own" on public.raid_pity for select using (auth.uid() = user_id);

-- 20260807014001 quiz_attempts_raid_source: extend existing source check + raid_run_id FK
alter table public.quiz_attempts
  add column if not exists raid_run_id uuid references public.raid_runs(id);

alter table public.quiz_attempts drop constraint if exists quiz_attempts_source_check;
alter table public.quiz_attempts
  add constraint quiz_attempts_source_check
  check (source is null or source in ('dungeon_bonus','raid_obstacle','raid_boss'));


-- =====================================================================================
-- SECTION 4: zone_id wiring for adventure/raid tables
-- Covers: 20260808150014 add_zone_id_to_adventure_and_raid_tables,
--         20260808150101 update_start_raid_run_zone_scoping (folded into RPC below)
-- =====================================================================================

alter table public.dungeon_types add column if not exists zone_id uuid references public.zones(id);


-- =====================================================================================
-- SECTION 5: raid seed data
-- Covers: raid_seed_data, raid_types_ridge_mist_naming, raid_obstacles_real_16,
--         raid_gear_qualities_label_th, raid_ridge_mist_real_art,
--         insert_raid_types_ridge_gale_storm
-- Real production rows (IDs preserved), 2026-08-15.
-- =====================================================================================

insert into public.raid_gear_qualities (code, label_th, main_value, sub_value, sort_order) values
  ('q1', 'แสงริบหรี่', 8, null, 1),
  ('q2', 'แสงนวล', 11, 4, 2),
  ('q3', 'แสงจ้า', 14, 6, 3),
  ('q4', 'แสงเจิดจ้า', 18, 7, 4)
on conflict (code) do update set label_th = excluded.label_th, main_value = excluded.main_value,
  sub_value = excluded.sub_value, sort_order = excluded.sort_order;

insert into public.raid_quality_thresholds (id, raid_type_id, min_score_pct, quality_code) values
  ('1a2bb0e5-bc6d-4af6-b028-a3147fe01a1c', null, 0, 'q1'),
  ('98de08ac-e91f-4b09-8f42-70b22b8ecedf', null, 30, 'q2'),
  ('9c715472-64f0-42f3-981b-8f9c4aa4331c', null, 60, 'q3'),
  ('35d44689-42b6-47ea-bd8b-d36a1e82ff32', null, 90, 'q4')
on conflict (id) do nothing;

insert into public.raid_types (id, slug, name_th, description_th, background_path, obstacle_count,
  boss_threshold_pct, boss_question_count, boss_pass_count, color_quota, sort_order, is_active,
  boss_name_th, boss_sprite_path, zone_id, boss_scene_path) values
  ('8d500dcc-7a45-4d0f-bbd3-eddc7f898822', 'ridge_mist', 'เชิงหมอกจาง',
    'จุดเริ่มต้นของภูเหนือเมฆ สายหมอกบางๆ ลอยคลออยู่ตามพื้นป่า', '/raid/ridge_mist.webp',
    3, 45, 5, 3, '{"red":1,"green":3,"yellow":2}'::jsonb, 1, true,
    'จิ้งจอกหิมะเฒ่า', '/raid/boss_ridge_mist.png',
    '23b82842-5b61-42c6-8ba1-6b9af6b34061', '/raid/boss_scene_ridge_mist.webp'),
  ('4847c1b0-42b2-455f-8e7b-2f1f3ab89d13', 'ridge_gale', 'สันลมโหม', null, '/raid/ridge_gale.webp',
    3, 60, 5, 3, '{"red":2,"green":2,"yellow":2}'::jsonb, 2, true,
    'เสือหิมะจอมผา', '/raid/boss_ridge_gale.png',
    '23b82842-5b61-42c6-8ba1-6b9af6b34061', '/raid/boss_scene_ridge_gale.webp'),
  ('84059664-36b2-4dfe-8ce1-8452bd977a45', 'ridge_storm', 'ยอดฟ้าคำราม', null, '/raid/ridge_storm.webp',
    4, 75, 5, 3, '{"red":4,"green":1,"yellow":3}'::jsonb, 3, true,
    'พญาหมาป่าสายฟ้า', '/raid/boss_ridge_storm.png',
    '23b82842-5b61-42c6-8ba1-6b9af6b34061', '/raid/boss_scene_ridge_storm.webp')
on conflict (id) do update set
  slug = excluded.slug, name_th = excluded.name_th, description_th = excluded.description_th,
  background_path = excluded.background_path, obstacle_count = excluded.obstacle_count,
  boss_threshold_pct = excluded.boss_threshold_pct, boss_question_count = excluded.boss_question_count,
  boss_pass_count = excluded.boss_pass_count, color_quota = excluded.color_quota,
  sort_order = excluded.sort_order, is_active = excluded.is_active,
  boss_name_th = excluded.boss_name_th, boss_sprite_path = excluded.boss_sprite_path,
  zone_id = excluded.zone_id, boss_scene_path = excluded.boss_scene_path;

insert into public.raid_obstacles (id, slug, name_th, stat, reveal_th, text_pass_roll_th,
  text_pass_quiz_th, text_fail_th, is_active, zone_id) values
  ('978021ca-8a41-41e4-87bd-984e5e618db0','avalanche','หิมะถล่ม','def',
   'หิมะจากด้านบนถล่มลงมา ต้องใช้พลังป้องกันตั้งรับ','ตั้งหลักมั่น หิมะไหลผ่านตัวไปโดยไม่สะเทือน',
   'ทันสังเกตว่าหิมะจะมาทางไหน เลี่ยงไปยืนหลังก้อนหินใหญ่','โดนหิมะกลบไปครึ่งตัว ขุดตัวเองออกมาแล้วเดินต่อได้',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('18afc2dd-24e9-484b-8477-5db4f4324eeb','bridge_snow','สะพานหิมะทรุด','spd',
   'สะพานหิมะเริ่มทรุดแล้ว ต้องใช้ความเร็ววิ่งข้ามให้ทัน','วิ่งข้ามไปได้ทัน สะพานทรุดลงข้างหลังพอดี',
   'เลือกเหยียบตรงที่หิมะยังแน่น ข้ามไปได้อย่างระวัง','สะพานทรุดกลางทาง ตกลงไปนิดหนึ่งแล้วปีนขึ้นฝั่งได้',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('1f47637e-af53-4959-863d-ba8eb669525c','climb_endless','ทางไต่ไม่รู้จบ','hp',
   'ทางไต่ยาวจนมองไม่เห็นปลาย ต้องใช้พลังชีวิตไปให้ถึง','ไต่ขึ้นไปเรื่อยๆ อย่างสม่ำเสมอจนถึงปลายทาง',
   'แบ่งทางเป็นช่วงสั้นๆ แล้วไต่ทีละช่วง ถึงปลายทางพอดี','หยุดหอบหลายรอบระหว่างทาง ขึ้นมาถึงช้ากว่าที่คิดแต่ก็ถึงแล้ว',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('d389892f-9bb4-48e5-b665-a9aaabe7205d','crevasse','รอยแยกลึก','spd',
   'รอยแยกกว้างขวางอยู่ตรงหน้า ต้องใช้ความเร็วกระโดดข้าม','ออกตัวเร็วแล้วกระโดดข้ามไปได้สวยงาม',
   'เดินเลียบไปหาจุดที่รอยแยกแคบที่สุดแล้วค่อยข้าม','ข้ามไม่พ้นในทีเดียว เกาะขอบไว้แล้วปีนขึ้นมาได้',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('4901d6a3-2c79-4d28-b026-1953fb3d0dbb','field_wide','ทุ่งหิมะกว้าง','hp',
   'ทุ่งหิมะกว้างไม่มีที่กำบัง ต้องใช้พลังชีวิตเดินให้ตลอด','เดินข้ามทุ่งรวดเดียวโดยไม่ต้องหยุดพักเลย',
   'เดินตามรอยเท้าเก่าที่หิมะแน่นแล้ว ประหยัดแรงไปได้เยอะ','หยุดพักหลายครั้งกว่าจะข้ามพ้น ใช้เวลานานแต่ก็ถึงอีกฝั่ง',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('9fe116f0-8d4e-441a-af58-51f897f81dfc','frost_cling','ไอเย็นเกาะขน','hp',
   'ไอเย็นเกาะตามตัวจนหนัก ต้องใช้พลังชีวิตทนความหนาวไว้','สะบัดไอเย็นออกจากตัวได้หมด เดินหน้าต่อเหมือนไม่มีอะไร',
   'หาที่บังลมยืนพักจนไอเย็นละลายไปเองแล้วค่อยเดินต่อ','เดินทั้งที่ตัวหนักและหนาวไปหมด ช้าหน่อยแต่ก็มาถึงจนได้',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('464e0d06-9f65-4b1e-b739-5fc2073e3107','gate_stone','ประตูหินปิดตาย','atk',
   'ประตูหินเก่าปิดสนิท ต้องใช้พลังโจมตีดันให้เปิด','ดันเต็มแรงครั้งเดียว ประตูเปิดออกพร้อมเสียงครืน',
   'สังเกตเห็นบานพับที่ผุแล้ว ดันตรงนั้นประตูก็ยอมเปิด','ดันอยู่หลายรอบกว่าจะเปิดพอให้ตัวลอดเข้าไปได้ แต่ก็เข้ามาได้แล้ว',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('7e5945e3-6ddb-4a51-be7a-e9e8427f5a15','gust_hard','ลมกระโชกแรง','def',
   'ลมกระโชกเป็นระลอก ต้องใช้พลังป้องกันยันไว้ไม่ให้ปลิว','ยันลมไว้อยู่ ไม่ขยับแม้แต่ก้าวเดียว',
   'จับจังหวะที่ลมเบาลงแล้วรีบเดินช่วงนั้น','ถูกลมพัดถอยหลังไปหลายก้าว ตั้งหลักใหม่แล้วเดินต่อมาได้',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('472d053d-0f49-4de2-90b9-0e03f69fc8b3','hail_storm','ลูกเห็บกระหน่ำ','def',
   'ลูกเห็บเทลงมาไม่หยุด ต้องใช้พลังป้องกันรับไว้','ยืนรับลูกเห็บได้สบาย เดินฝ่าไปเรื่อยๆ จนพ้น',
   'หลบเข้าใต้ชะง่อนหินจนลูกเห็บซาแล้วค่อยออกเดินต่อ','เดินฝ่าออกมาทั้งอย่างนั้น ตัวชาไปหมดแต่ก็พ้นมาแล้ว',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('ef917e1d-161d-4635-95fd-e36ed29f183a','ice_slick','พื้นลื่นเป็นแก้ว','spd',
   'พื้นลื่นจนเหมือนแก้ว ต้องใช้ความเร็วทรงตัวให้อยู่','ไถลไปตามพื้นได้อย่างควบคุม ถึงปลายทางแบบไม่ล้มเลย',
   'ลดความเร็วลงแล้วเดินซอยเท้าถี่ๆ ทรงตัวได้ตลอดทาง','ล้มไปสองสามที ลุกขึ้นปัดหิมะแล้วเดินต่อจนพ้นพื้นลื่น',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('fe1a909f-eaa6-4aab-ba60-7bacbbd8a111','ledge_narrow','ทางแคบริมเหว','spd',
   'ทางแคบเลียบริมเหว ต้องใช้ความเร็วผ่านให้ไวก่อนหินร่วง','ก้าวเท้าไวและแม่น ผ่านทางแคบไปได้ในพริบตา',
   'ดูตำแหน่งที่หินยังมั่นคงแล้วเหยียบตามจุดนั้นทีละก้าว','ค่อยๆ คืบไปช้าๆ ทั้งทาง ใจเต้นแรงแต่ก็ถึงอีกฝั่งแล้ว',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('0975891f-ebcd-4797-8488-24d13fef3a41','night_long','คืนเยือกยาว','hp',
   'คืนนี้ยาวและหนาวกว่าปกติ ต้องใช้พลังชีวิตทนให้ผ่านไป','ขดตัวรอจนฟ้าสาง ตื่นมายังสดชื่นเหมือนเดิม',
   'ก่อกองไฟเล็กๆ จากกิ่งไม้แห้ง ผ่านคืนนั้นมาได้อุ่นๆ','สั่นทั้งคืนจนฟ้าสว่าง เดินต่อได้ตอนเช้าแม้จะยังหนาวอยู่',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('47b122ef-887e-4235-8a23-6606453f594e','pine_fallen','ต้นสนล้มขวาง','atk',
   'ต้นสนใหญ่ล้มขวางทางอยู่ ต้องใช้พลังโจมตีหักให้พ้น','ฟาดกิ่งใหญ่ขาดออกจากกัน เดินผ่านได้สบาย',
   'เลือกหักตรงกิ่งที่แห้งที่สุด หักง่ายกว่าที่คิดมาก','ปีนข้ามลำต้นแทนที่จะหัก เลอะหิมะไปทั้งตัวแต่ก็ข้ามมาได้',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('bbedd52f-63a2-46ef-85b7-d44eef4dc6cb','shards_flying','สะเก็ดน้ำแข็งปลิว','def',
   'สะเก็ดน้ำแข็งปลิวมาตามลม ต้องใช้พลังป้องกันบังไว้','สะเก็ดกระทบตัวแล้วกระเด็นออกหมด เดินหน้าต่อได้เลย',
   'หันด้านที่แข็งแรงที่สุดเข้าสู้ลม เดินเฉียงผ่านไปได้','ตัวเป็นรอยขีดไปทั่ว ก้มหน้าเดินฝ่ามาจนพ้นเขตลม',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('4985a536-3567-4c68-8ad2-9b374f017cf7','slope_steep','เนินชันตั้งฉาก','atk',
   'เนินหินชันเกือบตั้งฉาก ต้องใช้พลังโจมตีตะกุยขึ้นไป','ตะกุยขึ้นไปรวดเดียวถึงยอดเนิน',
   'มองเห็นร่องหินที่พอเกาะได้ ไต่ตามร่องนั้นขึ้นมาได้','ไถลลงมาสองสามครั้งกว่าจะขึ้นถึง เหนื่อยหน่อยแต่ขึ้นมาได้แล้ว',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('e5ebd2f2-ca5d-4fc9-bd42-9be7f30ec5f9','wall_ice','กำแพงน้ำแข็ง','atk',
   'กำแพงน้ำแข็งหนาปิดทางไว้ ต้องใช้พลังโจมตีทุบให้แตก','ฟาดเข้าไปทีเดียว น้ำแข็งแตกกระจายเป็นทาง',
   'หาจุดที่น้ำแข็งบางที่สุดเจอ ทุบตรงนั้นทีเดียวก็ทะลุ','ค่อยๆ เซาะทีละนิดจนพอลอดผ่านไปได้ ใช้เวลาหน่อยแต่ก็ผ่านมาแล้ว',
   true,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  -- 4 tmp_* rows: original placeholders before real art/copy landed, kept but inactive
  ('ecf645df-f2fe-4e1d-8ce3-e2b98d21650a','tmp_cliff','[ชั่วคราว] หน้าผาน้ำแข็ง','atk',
   '[ชั่วคราว] ด่านนี้วัดพลังโจมตี (ATK)','[ชั่วคราว] ฟันหน้าผาแตกง่ายๆ ผ่านไปได้เลย!',
   '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้','[ชั่วคราว] หน้าผาแข็งเกินไป ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้',
   false,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('ea569f35-4f25-4b46-bb60-8cfc841e9f33','tmp_crevasse','[ชั่วคราว] รอยแยกธารน้ำแข็ง','spd',
   '[ชั่วคราว] ด่านนี้วัดความเร็ว (SPD)','[ชั่วคราว] กระโดดข้ามได้ทันใจ ผ่านไปได้เลย!',
   '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้','[ชั่วคราว] กระโดดไม่ทัน ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้',
   false,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('afa8982a-bee5-44ef-9f66-2f563fc7efe0','tmp_storm','[ชั่วคราว] พายุหิมะ','def',
   '[ชั่วคราว] ด่านนี้วัดพลังป้องกัน (DEF)','[ชั่วคราว] ทนพายุไหวสบายๆ ผ่านไปได้เลย!',
   '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้','[ชั่วคราว] พายุแรงเกินไป ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้',
   false,'23b82842-5b61-42c6-8ba1-6b9af6b34061'),
  ('9d4b677f-0414-4f63-951e-29b3584f1e27','tmp_trek','[ชั่วคราว] เดินทางไกลในความหนาว','hp',
   '[ชั่วคราว] ด่านนี้วัดพลังชีวิต (HP)','[ชั่วคราว] ร่างกายแข็งแรงพอ เดินฝ่าไปได้เลย!',
   '[ชั่วคราว] เกือบไปแล้ว แต่ตอบคำถามได้ก็รอดมาได้','[ชั่วคราว] อ่อนล้าเกินไป ตอบคำถามก็ยังไม่รอด แต่ยังไปต่อได้',
   false,'23b82842-5b61-42c6-8ba1-6b9af6b34061')
on conflict (id) do update set
  slug = excluded.slug, name_th = excluded.name_th, stat = excluded.stat,
  reveal_th = excluded.reveal_th, text_pass_roll_th = excluded.text_pass_roll_th,
  text_pass_quiz_th = excluded.text_pass_quiz_th, text_fail_th = excluded.text_fail_th,
  is_active = excluded.is_active, zone_id = excluded.zone_id;

-- raid_allowlist: the 2 accounts currently allowed into the raid system
-- (test accounts panuwat.pond@gmail.com and daou@mail.com per project memory)
insert into public.raid_allowlist (user_id, note) values
  ('792b8e1d-410c-4158-9c62-32b437b05121', 'PonDKunG (test account)'),
  ('abbc806f-8da6-49b8-a655-3aeb9dcae6e8', 'Daou (test account)')
on conflict (user_id) do nothing;

-- 20260810151902 add_egg_epic_01_napha (in repo already) -- confirm current obtainability flag
-- reflects DB truth (is_obtainable=true as of 2026-08-15; prior project-memory note of
-- is_obtainable=false is stale, DB overrides here per project verification rule):
update public.egg_types set is_obtainable = true where id = 'egg_epic_01';


-- =====================================================================================
-- SECTION 6: raid RPCs
-- Covers: start_raid_run_rpc, choose_raid_path_rpc, submit_raid_obstacle_answer_rpc,
--         raid_boss_rpcs, claim_raid_reward_rpc, fix_answer_raid_boss_answered_count,
--         raid_rpcs_add_allowlist_guard, start_raid_run_add_is_active_check,
--         choose_raid_path_add_roll_scaled_fields, update_start_raid_run_zone_scoping,
--         open_raid_to_all_students, enforce_raid_level_progression_server_side,
--         fix_raid_first_clear_check_outcome_win,
--         start_raid_run_color_by_pass_probability (both applies, final def below)
-- Final current definitions (pulled live 2026-08-15):
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.start_raid_run(p_pet_id uuid, p_raid_type_id uuid)
 RETURNS raid_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_pet record;
  v_raid_type record;
  v_prev_type_id uuid;
  v_ticket_id uuid;
  v_run public.raid_runs;
  v_caps jsonb;
  v_gear_bonus jsonb;
  v_stat_snapshot jsonb;
  v_gauge_max int := 0;
  v_step_obstacle_a uuid[] := array[]::uuid[];
  v_step_obstacle_b uuid[] := array[]::uuid[];
  v_step_color_a text[] := array[]::text[];
  v_step_color_b text[] := array[]::text[];
  v_pair_ids uuid[];
  v_pair_stats text[];
  v_stat_a text;
  v_stat_b text;
  v_pass_a numeric;
  v_pass_b numeric;
  v_color_a text;
  v_color_b text;
  v_weight_a int;
  v_weight_b int;
  i int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  select id, stage, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, egg_type_id
    into v_pet
  from public.pets
  where id = p_pet_id and user_id = v_user_id and stage = 4 and is_active = false;

  if not found then
    raise exception 'Qmon ตัวนี้ยังไม่พร้อมท้าทาย (ต้องโตเต็มที่และเก็บเข้าสมุดแล้ว)';
  end if;

  if exists (select 1 from public.raid_runs where user_id = v_user_id and status = 'in_progress') then
    raise exception 'มีการท้าทายที่ยังไม่จบอยู่ ทำให้จบก่อนเริ่มรอบใหม่';
  end if;

  select id, obstacle_count, boss_threshold_pct, zone_id, sort_order
    into v_raid_type
  from public.raid_types
  where id = p_raid_type_id and is_active = true;

  if not found then
    raise exception 'ไม่พบด่านนี้ หรือด่านปิดใช้งานอยู่';
  end if;

  -- เช็คลำดับด่านฝั่ง server (เพิ่ม 11 ส.ค. 2026, แก้ให้เช็ค outcome='win' เพิ่มวันเดียวกัน) —
  -- เดิมมีแค่ UI ซ่อนปุ่ม ไม่ enforce จริง ต้องผ่าน (ชนะ) ด่านก่อนหน้าจริงๆ ไม่ใช่แค่เล่นจบ (แพ้ก็นับ
  -- เป็น completed เหมือนกัน) ให้ตรงกับเงื่อนไข unlocked ฝั่ง frontend (getRaidZonesWithLevels)
  select id into v_prev_type_id
  from public.raid_types
  where zone_id = v_raid_type.zone_id
    and sort_order = v_raid_type.sort_order - 1
    and is_active = true;

  if v_prev_type_id is not null then
    if not exists (
      select 1 from public.raid_runs
      where user_id = v_user_id and raid_type_id = v_prev_type_id and status = 'completed' and outcome = 'win'
    ) then
      raise exception 'ต้องผ่านด่านก่อนหน้าก่อนถึงจะท้าทายด่านนี้ได้';
    end if;
  end if;

  select id into v_ticket_id
  from public.raid_tickets
  where user_id = v_user_id and consumed_at is null and zone_id = v_raid_type.zone_id
  order by granted_at asc
  limit 1
  for update;

  if v_ticket_id is null then
    raise exception 'ไม่มีกุญแจท้าทายของโซนนี้เหลืออยู่';
  end if;

  select stat_profile->'caps' into v_caps
  from public.egg_types
  where id = v_pet.egg_type_id;

  if v_caps is null then
    raise exception 'ไม่พบข้อมูล cap ของไข่นี้';
  end if;

  select jsonb_build_object(
    'hp', coalesce(sum(case when main_stat = 'hp' then main_value when sub_stat = 'hp' then sub_value else 0 end), 0),
    'atk', coalesce(sum(case when main_stat = 'atk' then main_value when sub_stat = 'atk' then sub_value else 0 end), 0),
    'def', coalesce(sum(case when main_stat = 'def' then main_value when sub_stat = 'def' then sub_value else 0 end), 0),
    'spd', coalesce(sum(case when main_stat = 'spd' then main_value when sub_stat = 'spd' then sub_value else 0 end), 0)
  ) into v_gear_bonus
  from public.raid_gear_items
  where equipped_pet_id = p_pet_id;

  v_stat_snapshot := jsonb_build_object(
    'hp', least(coalesce(v_pet.stat_hp, 0) + coalesce((v_gear_bonus->>'hp')::int, 0), (v_caps->>'hp')::int),
    'atk', least(coalesce(v_pet.stat_atk, 0) + coalesce((v_gear_bonus->>'atk')::int, 0), (v_caps->>'atk')::int),
    'def', least(coalesce(v_pet.stat_def, 0) + coalesce((v_gear_bonus->>'def')::int, 0), (v_caps->>'def')::int),
    'spd', least(coalesce(v_pet.stat_spd, 0) + coalesce((v_gear_bonus->>'spd')::int, 0), (v_caps->>'spd')::int),
    'foc', least(coalesce(v_pet.stat_foc, 0), (v_caps->>'foc')::int)
  );

  for i in 0 .. v_raid_type.obstacle_count - 1 loop
    select array_agg(id order by rnd), array_agg(stat order by rnd)
      into v_pair_ids, v_pair_stats
    from (
      select id, stat, random() as rnd
      from public.raid_obstacles
      where is_active = true and zone_id = v_raid_type.zone_id
      order by random() limit 2
    ) t;

    if v_pair_ids is null or array_length(v_pair_ids, 1) < 2 then
      raise exception 'ยังไม่มีอุปสรรคพอสำหรับโซนนี้';
    end if;

    v_stat_a := v_pair_stats[1];
    v_stat_b := v_pair_stats[2];

    -- สูตรเดียวกับ choose_raid_path(): P(ผ่าน) = stat_snapshot[stat] ÷ caps_snapshot[stat]
    v_pass_a := case when (v_caps->>v_stat_a)::numeric > 0
      then (v_stat_snapshot->>v_stat_a)::numeric / (v_caps->>v_stat_a)::numeric else 0 end;
    v_pass_b := case when (v_caps->>v_stat_b)::numeric > 0
      then (v_stat_snapshot->>v_stat_b)::numeric / (v_caps->>v_stat_b)::numeric else 0 end;

    v_color_a := case when v_pass_a >= 0.6 then 'green' when v_pass_a >= 0.35 then 'yellow' else 'red' end;
    v_color_b := case when v_pass_b >= 0.6 then 'green' when v_pass_b >= 0.35 then 'yellow' else 'red' end;

    v_step_obstacle_a := v_step_obstacle_a || v_pair_ids[1];
    v_step_obstacle_b := v_step_obstacle_b || v_pair_ids[2];
    v_step_color_a := v_step_color_a || v_color_a;
    v_step_color_b := v_step_color_b || v_color_b;

    v_weight_a := case v_color_a when 'green' then 0 when 'yellow' then 1 else 2 end;
    v_weight_b := case v_color_b when 'green' then 0 when 'yellow' then 1 else 2 end;
    v_gauge_max := v_gauge_max + greatest(v_weight_a, v_weight_b);
  end loop;

  if v_gauge_max = 0 then
    v_gauge_max := 1;
  end if;

  insert into public.raid_runs (
    user_id, pet_id, raid_type_id, ticket_id, stat_snapshot, caps_snapshot,
    threshold_pct, gauge_max
  ) values (
    v_user_id, p_pet_id, p_raid_type_id, v_ticket_id, v_stat_snapshot, v_caps,
    v_raid_type.boss_threshold_pct, v_gauge_max
  )
  returning * into v_run;

  for i in 0 .. v_raid_type.obstacle_count - 1 loop
    insert into public.raid_run_steps (
      run_id, step_index, option_a_obstacle_id, option_a_color, option_b_obstacle_id, option_b_color
    ) values (
      v_run.id, i, v_step_obstacle_a[i + 1], v_step_color_a[i + 1], v_step_obstacle_b[i + 1], v_step_color_b[i + 1]
    );
  end loop;

  update public.raid_tickets
  set consumed_at = now(), consumed_run_id = v_run.id
  where id = v_ticket_id;

  return v_run;
end;
$function$;

CREATE OR REPLACE FUNCTION public.choose_raid_path(p_run_id uuid, p_side text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_step public.raid_run_steps;
  v_obstacle public.raid_obstacles;
  v_weight int;
  v_stat_value numeric;
  v_cap_value numeric;
  v_threshold numeric;
  v_roll numeric;
  v_passed boolean;
  v_result jsonb;
  v_question record;
  v_weak_category text;
  v_weak_count int;
  v_band text;
  v_obstacle_count int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  if p_side not in ('a', 'b') then
    raise exception 'ค่าตัวเลือกไม่ถูกต้อง';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'choosing' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงเลือกทาง';
  end if;

  select * into v_step
  from public.raid_run_steps
  where run_id = p_run_id and step_index = v_run.current_step_index
  for update;

  if not found then
    raise exception 'ไม่พบจุดทางแยกนี้';
  end if;

  if v_step.chosen_side is not null then
    raise exception 'เลือกทางนี้ไปแล้ว';
  end if;

  select * into v_obstacle
  from public.raid_obstacles
  where id = (case p_side when 'a' then v_step.option_a_obstacle_id else v_step.option_b_obstacle_id end);

  v_weight := case (case p_side when 'a' then v_step.option_a_color else v_step.option_b_color end)
    when 'green' then 0 when 'yellow' then 1 else 2 end;

  update public.raid_run_steps
  set chosen_side = p_side, chosen_at = now()
  where id = v_step.id;

  update public.raid_runs
  set gauge_earned = gauge_earned + v_weight
  where id = v_run.id;

  v_stat_value := (v_run.stat_snapshot ->> v_obstacle.stat)::numeric;
  v_cap_value := (v_run.caps_snapshot ->> v_obstacle.stat)::numeric;
  v_threshold := case when v_cap_value > 0 then v_stat_value / v_cap_value else 0 end;
  v_roll := random();
  v_passed := v_roll < v_threshold;

  update public.raid_run_steps
  set roll_threshold = v_threshold, roll_value = v_roll, roll_passed = v_passed
  where id = v_step.id;

  select obstacle_count into v_obstacle_count from public.raid_types where id = v_run.raid_type_id;

  if v_passed then
    update public.raid_run_steps
    set resolved_at = now()
    where id = v_step.id;

    if v_run.current_step_index + 1 >= v_obstacle_count then
      update public.raid_runs set current_step_index = current_step_index + 1, phase = 'boss' where id = v_run.id;
    else
      update public.raid_runs set current_step_index = current_step_index + 1 where id = v_run.id;
    end if;

    v_result := jsonb_build_object(
      'stat', v_obstacle.stat,
      'revealTh', v_obstacle.reveal_th,
      'rollPassed', true,
      'resultText', v_obstacle.text_pass_roll_th,
      'needsQuiz', false,
      'rollValueScaled', round(v_roll * 100),
      'rollThresholdScaled', round(v_threshold * 100)
    );
  else
    select p.grade_band into v_band from public.profiles p where p.id = v_user_id;
    v_band := coalesce(v_band, 'junior');

    select q.category into v_weak_category
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = v_user_id
      and qa.source is null
      and q.grade_band = v_band
    group by q.category
    having count(*) >= 10
    order by (sum(qa.is_correct::int)::numeric / count(*)) asc
    limit 1;

    if v_weak_category is not null then
      select count(*) into v_weak_count
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band and qz.category = v_weak_category;
      if v_weak_count = 0 then
        v_weak_category := null;
      end if;
    end if;

    if v_weak_category is not null then
      select qz.id, qz.question_text, qz.choices into v_question
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band and qz.category = v_weak_category
      order by random()
      limit 1;
    else
      select qz.id, qz.question_text, qz.choices into v_question
      from public.questions qz
      where qz.status = 'active' and qz.grade_band = v_band
      order by random()
      limit 1;
    end if;

    update public.raid_run_steps
    set quiz_question_id = v_question.id, quiz_pulled_at = now()
    where id = v_step.id;

    update public.raid_runs set phase = 'quiz' where id = v_run.id;

    v_result := jsonb_build_object(
      'stat', v_obstacle.stat,
      'revealTh', v_obstacle.reveal_th,
      'rollPassed', false,
      'needsQuiz', true,
      'question', jsonb_build_object(
        'id', v_question.id,
        'questionText', v_question.question_text,
        'choices', v_question.choices
      ),
      'rollValueScaled', round(v_roll * 100),
      'rollThresholdScaled', round(v_threshold * 100)
    );
  end if;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_raid_obstacle_answer(p_run_id uuid, p_choice_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_step public.raid_run_steps;
  v_obstacle public.raid_obstacles;
  v_correct_index int;
  v_is_correct boolean;
  v_result_text text;
  v_obstacle_count int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'quiz' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงตอบคำถามแก้ตัว';
  end if;

  select * into v_step
  from public.raid_run_steps
  where run_id = p_run_id and step_index = v_run.current_step_index
  for update;

  if not found or v_step.quiz_question_id is null then
    raise exception 'ไม่พบคำถามนี้';
  end if;

  if v_step.quiz_correct is not null then
    raise exception 'ตอบคำถามนี้ไปแล้ว';
  end if;

  select correct_index into v_correct_index
  from public.questions
  where id = v_step.quiz_question_id;

  v_is_correct := p_choice_index = v_correct_index;

  update public.raid_run_steps
  set quiz_correct = v_is_correct, resolved_at = now()
  where id = v_step.id;

  if not v_is_correct then
    update public.raid_runs set fail_count = fail_count + 1 where id = v_run.id;
  end if;

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, raid_run_id)
  values (v_user_id, v_step.quiz_question_id, v_is_correct, v_run.pet_id, 'raid_obstacle', v_run.id);

  select * into v_obstacle
  from public.raid_obstacles
  where id = (case v_step.chosen_side when 'a' then v_step.option_a_obstacle_id else v_step.option_b_obstacle_id end);

  v_result_text := case when v_is_correct then v_obstacle.text_pass_quiz_th else v_obstacle.text_fail_th end;

  select obstacle_count into v_obstacle_count from public.raid_types where id = v_run.raid_type_id;

  if v_run.current_step_index + 1 >= v_obstacle_count then
    update public.raid_runs set current_step_index = current_step_index + 1, phase = 'boss' where id = v_run.id;
  else
    update public.raid_runs set current_step_index = current_step_index + 1, phase = 'choosing' where id = v_run.id;
  end if;

  return jsonb_build_object('isCorrect', v_is_correct, 'resultText', v_result_text);
end;
$function$;

CREATE OR REPLACE FUNCTION public.answer_raid_boss(p_run_id uuid, p_seq integer, p_choice_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_bq public.raid_boss_questions;
  v_correct_index int;
  v_explanation text;
  v_is_correct boolean;
  v_boss_correct_count int;
  v_answered_count int;
  v_raid_type record;
  v_gate_stat boolean;
  v_gate_quiz boolean;
  v_outcome text;
  v_total_pct numeric;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.status <> 'in_progress' or v_run.phase <> 'boss' then
    raise exception 'ตอนนี้ไม่ใช่ช่วงต่อสู้บอส';
  end if;

  select * into v_bq
  from public.raid_boss_questions
  where run_id = p_run_id and seq = p_seq
  for update;

  if not found then
    raise exception 'ไม่พบคำถามข้อนี้';
  end if;

  if v_bq.answered_at is not null then
    raise exception 'ตอบข้อนี้ไปแล้ว';
  end if;

  select correct_index, explanation into v_correct_index, v_explanation
  from public.questions where id = v_bq.question_id;

  v_is_correct := p_choice_index = v_correct_index;

  update public.raid_boss_questions
  set answered_at = now(), is_correct = v_is_correct
  where id = v_bq.id;

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, raid_run_id)
  values (v_user_id, v_bq.question_id, v_is_correct, v_run.pet_id, 'raid_boss', v_run.id);

  -- 20260807020103 fix_answer_raid_boss_answered_count: count answered_count/correct
  -- straight from the raid_boss_questions rows themselves rather than trusting a
  -- client-supplied counter, so a retried/duplicated call can't inflate the tally.
  select count(*) filter (where is_correct), count(*) filter (where answered_at is not null)
    into v_boss_correct_count, v_answered_count
  from public.raid_boss_questions where run_id = p_run_id;

  update public.raid_runs set boss_correct_count = v_boss_correct_count where id = p_run_id;

  select * into v_raid_type from public.raid_types where id = v_run.raid_type_id;

  v_outcome := null;

  if v_answered_count >= v_raid_type.boss_question_count then
    v_total_pct := (
      (v_run.stat_snapshot->>'hp')::numeric + (v_run.stat_snapshot->>'atk')::numeric +
      (v_run.stat_snapshot->>'def')::numeric + (v_run.stat_snapshot->>'spd')::numeric +
      (v_run.stat_snapshot->>'foc')::numeric
    ) / 500 * 100;

    v_gate_stat := v_total_pct >= v_run.threshold_pct;
    v_gate_quiz := v_boss_correct_count >= v_raid_type.boss_pass_count;

    v_outcome := case
      when v_gate_stat and v_gate_quiz then 'win'
      when not v_gate_stat then 'lose_stat'
      else 'lose_quiz'
    end;

    update public.raid_runs set phase = 'reward', outcome = v_outcome where id = p_run_id;
  end if;

  return jsonb_build_object(
    'isCorrect', v_is_correct,
    'correctIndex', v_correct_index,
    'explanation', v_explanation,
    'bossCorrectCount', v_boss_correct_count,
    'isLast', v_answered_count >= v_raid_type.boss_question_count,
    'outcome', v_outcome
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_raid_reward(p_run_id uuid)
 RETURNS TABLE(gear_id uuid, slot text, main_stat text, main_value integer, sub_stat text, sub_value integer, quality text, egg_awarded boolean, egg_type_id text, egg_name_th text, pity_meter integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_run public.raid_runs;
  v_gear public.raid_gear_items;
  v_score int;
  v_score_pct numeric;
  v_quality_code text;
  v_quality record;
  v_slot text;
  v_main_stat text;
  v_sub_stat text;
  v_stats text[] := array['atk','hp','def','spd'];
  v_remaining text[];
  v_raid_slug text;
  v_egg_awarded boolean := false;
  v_egg_type_id text;
  v_egg_name_th text;
  v_is_first_clear boolean;
  v_meter int;
  v_epic_egg_id constant text := 'egg_epic_01';
  v_pity_cap constant int := 10;
  v_base_rate constant numeric := 0.10;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  select * into v_run
  from public.raid_runs
  where id = p_run_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบการท้าทายนี้';
  end if;

  if v_run.gear_item_id is not null then
    select * into v_gear from public.raid_gear_items where id = v_run.gear_item_id;
    select meter into v_meter from public.raid_pity where user_id = v_user_id and reward_tier = 'epic';
    return query
    select v_gear.id, v_gear.slot, v_gear.main_stat, v_gear.main_value, v_gear.sub_stat, v_gear.sub_value, v_gear.quality,
           v_run.egg_awarded, v_run.egg_type_id,
           (select e.name_th from public.egg_types e where e.id = v_run.egg_type_id),
           v_meter;
    return;
  end if;

  if v_run.phase <> 'reward' then
    raise exception 'ตอนนี้ยังรับของไม่ได้';
  end if;

  select slug into v_raid_slug from public.raid_types where id = v_run.raid_type_id;

  v_score := greatest(0, v_run.gauge_earned - v_run.fail_count);
  v_score_pct := v_score::numeric / v_run.gauge_max * 100;

  select quality_code into v_quality_code
  from public.raid_quality_thresholds
  where (raid_type_id is null or raid_type_id = v_run.raid_type_id)
    and min_score_pct <= v_score_pct
  order by min_score_pct desc
  limit 1;

  if v_quality_code is null then
    raise exception 'ไม่พบระดับคุณภาพสำหรับคะแนนนี้';
  end if;

  select * into v_quality from public.raid_gear_qualities where code = v_quality_code;

  v_slot := (array['head','body','feet'])[floor(random() * 3)::int + 1];

  v_main_stat := case v_slot
    when 'head' then (array['atk','hp'])[floor(random() * 2)::int + 1]
    when 'body' then (array['def','spd'])[floor(random() * 2)::int + 1]
    else (array['spd','atk'])[floor(random() * 2)::int + 1]
  end;

  if v_quality.sub_value is not null then
    select array_agg(s) into v_remaining from unnest(v_stats) s where s <> v_main_stat;
    v_sub_stat := v_remaining[floor(random() * 3)::int + 1];
  else
    v_sub_stat := null;
  end if;

  insert into public.raid_gear_items (
    owner_user_id, slot, main_stat, main_value, sub_stat, sub_value, quality, source_run_id
  ) values (
    v_user_id, v_slot, v_main_stat, v_quality.main_value, v_sub_stat, v_quality.sub_value, v_quality_code, p_run_id
  )
  returning * into v_gear;

  -- epic egg logic: ridge_storm wins only. is_first_clear now requires outcome='win' too (fixed 2026-08-11)
  if v_raid_slug = 'ridge_storm' and v_run.outcome = 'win' then
    select not exists (
      select 1 from public.raid_runs
      where user_id = v_user_id
        and raid_type_id = v_run.raid_type_id
        and status = 'completed'
        and outcome = 'win'
        and id <> p_run_id
    ) into v_is_first_clear;

    if v_is_first_clear then
      v_egg_awarded := true;
    else
      insert into public.raid_pity (user_id, reward_tier, meter)
      values (v_user_id, 'epic', 0)
      on conflict (user_id, reward_tier) do nothing;

      select meter into v_meter
      from public.raid_pity
      where user_id = v_user_id and reward_tier = 'epic'
      for update;

      if v_meter >= v_pity_cap then
        v_egg_awarded := true;
      elsif random() < v_base_rate then
        v_egg_awarded := true;
      end if;

      if v_egg_awarded then
        update public.raid_pity set meter = 0
        where user_id = v_user_id and reward_tier = 'epic';
        v_meter := 0;
      else
        update public.raid_pity set meter = meter + 1
        where user_id = v_user_id and reward_tier = 'epic'
        returning meter into v_meter;
      end if;
    end if;

    if v_egg_awarded then
      v_egg_type_id := v_epic_egg_id;
      insert into public.player_eggs (user_id, egg_type_id, source)
      values (v_user_id, v_egg_type_id, 'raid_reward');
      select name_th into v_egg_name_th from public.egg_types where id = v_egg_type_id;
    end if;
  end if;

  update public.raid_runs
  set gear_item_id = v_gear.id, status = 'completed', completed_at = now(), phase = 'done',
      egg_awarded = v_egg_awarded, egg_type_id = v_egg_type_id
  where id = p_run_id;

  select meter into v_meter from public.raid_pity where user_id = v_user_id and reward_tier = 'epic';

  return query
  select v_gear.id, v_gear.slot, v_gear.main_stat, v_gear.main_value, v_gear.sub_stat, v_gear.sub_value, v_gear.quality,
         v_egg_awarded, v_egg_type_id, v_egg_name_th, v_meter;
end;
$function$;

CREATE OR REPLACE FUNCTION public.equip_raid_gear(p_item_id uuid, p_pet_id uuid)
 RETURNS raid_gear_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.raid_gear_items;
  v_pet_owner uuid;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.raid_allowlist where user_id = v_user_id) then
    raise exception 'ยังไม่เปิดให้เข้าระบบนี้';
  end if;

  select user_id into v_pet_owner from public.pets where id = p_pet_id;
  if v_pet_owner is null or v_pet_owner <> v_user_id then
    raise exception 'ไม่พบ Qmon ตัวนี้';
  end if;

  if exists (
    select 1 from public.raid_runs where pet_id = p_pet_id and status = 'in_progress'
  ) then
    raise exception 'กำลังอยู่ในรอบท้าทาย ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  select * into v_item
  from public.raid_gear_items
  where id = p_item_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบอุปกรณ์ชิ้นนี้';
  end if;

  if v_item.equipped_pet_id is not null then
    raise exception 'อุปกรณ์นี้ใส่อยู่กับตัวอื่นอยู่ ต้องถอดก่อนถึงจะย้ายได้';
  end if;

  begin
    update public.raid_gear_items
    set equipped_pet_id = p_pet_id
    where id = p_item_id
    returning * into v_item;
  exception when unique_violation then
    raise exception 'ช่องนี้หรือแกนนี้มีอุปกรณ์ใส่อยู่แล้ว ถอดตัวเดิมออกก่อน';
  end;

  return v_item;
end;
$function$;

CREATE OR REPLACE FUNCTION public.unequip_raid_gear(p_item_id uuid)
 RETURNS raid_gear_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_item public.raid_gear_items;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_item
  from public.raid_gear_items
  where id = p_item_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'ไม่พบอุปกรณ์ชิ้นนี้';
  end if;

  if v_item.equipped_pet_id is null then
    return v_item;
  end if;

  if exists (
    select 1 from public.raid_runs where pet_id = v_item.equipped_pet_id and status = 'in_progress'
  ) then
    raise exception 'กำลังอยู่ในรอบท้าทาย ถอด/ใส่อุปกรณ์ไม่ได้ตอนนี้';
  end if;

  update public.raid_gear_items
  set equipped_pet_id = null
  where id = p_item_id
  returning * into v_item;

  return v_item;
end;
$function$;

-- 20260810215155 open_raid_to_all_students: allowlist gate above still exists in the
-- RPCs (v_run raises 'ยังไม่เปิดให้เข้าระบบนี้' if not in raid_allowlist), but per project
-- memory the allowlist itself currently contains only the 2 test accounts -- "opening to
-- all students" was a decision/UI change, not a schema change; no DDL to replay here.


-- =====================================================================================
-- SECTION 7: pet growth stats snapshot columns
-- Covers: add_pet_growth_stats_snapshot, add_pet_growth_subject_breakdown
-- Backfill migrations (backfill_pet_growth_stats_snapshot,
-- backfill_pet_growth_subject_breakdown) are NOT re-run here -- they were one-time
-- data migrations against the pets table as it existed on 2026-08-09. Re-running them
-- against current data would overwrite real player progress. Recorded as history only.
-- =====================================================================================

alter table public.pets add column if not exists growth_questions_answered integer;
alter table public.pets add column if not exists growth_questions_correct integer;
alter table public.pets add column if not exists growth_subject_breakdown jsonb;

-- Historical note: 20260809102102_backfill_pet_growth_stats_snapshot populated
-- growth_questions_answered/growth_questions_correct from quiz_attempts history as of
-- 2026-08-09. 20260809123412_backfill_pet_growth_subject_breakdown populated
-- growth_subject_breakdown similarly. Neither is replayed by this file.


-- =====================================================================================
-- SECTION 8: profile/friends ranking RPC fixes (2026-08-14)
-- Covers: profile_friends_phase8_ranking_fix_rank_nulls,
--         profile_friends_phase8_fix_get_my_rank_missing_row,
--         restore_get_ranking_limit_50
-- Depends on public._ranking_full / public._ranking_pride_pet_id helper functions and
-- the base profile_friends_phase8_ranking migration, which ARE already committed in
-- this repo (20260814100330_profile_friends_phase8_ranking.sql) -- only the 3 fix-up
-- migrations on top of it were missing.
-- Final current definitions (pulled live 2026-08-15):
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_my_rank(p_category text, p_scope text)
 RETURNS TABLE(found boolean, rank integer, username text, pet_nickname text, pet_stage integer, pet_subline text, pet_personality text, egg_sprite_prefix text, egg_name_th text, score_value integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if p_category not in ('weekly_training','consistency','achievement','collector') then
    raise exception 'หมวดไม่ถูกต้อง';
  end if;
  if p_scope not in ('all','friends') then raise exception 'ขอบเขตไม่ถูกต้อง'; end if;

  return query
  with full_rank as (
    select * from public._ranking_full(p_category, v_me, p_scope)
  )
  select
    (fr.score is not null),
    fr.rnk,
    pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    fr.score
  from public.profiles pr
  left join full_rank fr on fr.cand_id = v_me
  left join public.pets pt on pt.id = public._ranking_pride_pet_id(v_me)
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = v_me;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_ranking(p_category text, p_scope text)
 RETURNS TABLE(rank integer, user_id uuid, username text, pet_nickname text, pet_stage integer, pet_subline text, pet_personality text, egg_sprite_prefix text, egg_name_th text, score_value integer, is_me boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if p_category not in ('weekly_training','consistency','achievement','collector') then
    raise exception 'หมวดไม่ถูกต้อง';
  end if;
  if p_scope not in ('all','friends') then raise exception 'ขอบเขตไม่ถูกต้อง'; end if;

  return query
  with full_rank as (
    select * from public._ranking_full(p_category, v_me, p_scope)
  )
  select
    fr.rnk, fr.cand_id, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    fr.score, fr.cand_id = v_me
  from full_rank fr
  join public.profiles pr on pr.id = fr.cand_id
  left join public.pets pt on pt.id = public._ranking_pride_pet_id(fr.cand_id)
  left join public.egg_types et on et.id = pt.egg_type_id
  where p_scope = 'friends' or fr.score is not null
  order by (fr.score is null) asc, fr.rnk asc nulls last, pr.username asc
  limit case when p_scope = 'all' then 50 else null end;
end;
$function$;

-- =====================================================================================
-- END OF SQUASH FILE
-- Verify step (per project workflow): after committing this file, re-run list_migrations
-- against project wmndxiuqzrnqbhrznmfg and diff against supabase/migrations/ again to
-- confirm 100% parity, then update game-design-document-v1.0.md §8 #11 to closed.
-- =====================================================================================
