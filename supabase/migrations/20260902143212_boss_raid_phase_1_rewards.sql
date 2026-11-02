-- Migration: 20260902180000_boss_raid_phase_1_rewards
-- Classroom Boss Raid — Phase 1 สไลซ์ 1.2: เลือกไข่รางวัล + แจก Top-N อัตโนมัติเมื่อชนะบอส

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.boss_raid_sessions
  add column reward_distributed_at timestamptz;

comment on column public.boss_raid_sessions.reward_distributed_at is
  'เวลาที่ระบบแจกไข่รางวัล Top-N สำเร็จ (null = ยังไม่แจก / ไม่ชนะ / ครูไม่ได้ตั้งรางวัล). atomic guard กันแจกซ้ำใน distribute_boss_raid_rewards().';

comment on column public.player_eggs.source is
  'ที่มาของไข่ — ค่าที่ใช้ตอนนี้: starter, collection_choice, weekly_leaderboard_reward, raid_reward, dungeon_claim, boss_raid_reward (Top-N ตอนชนะ Classroom Boss Raid). ค่าเก่าที่เลิกใช้: first_pet_reward. ใช้ text ตั้งใจ (เพิ่ม source ใหม่ไม่ต้อง ALTER)';

create table public.boss_raid_rewards (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.boss_raid_sessions(id) on delete cascade,
  participant_id uuid not null references public.boss_raid_participants(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  egg_type_id    text not null references public.egg_types(id),
  player_egg_id  uuid references public.player_eggs(id) on delete set null,
  rank           int  not null,
  total_damage   int  not null,
  awarded_at     timestamptz not null default now(),
  unique (session_id, participant_id)
);

comment on table public.boss_raid_rewards is
  'Log การแจกไข่รางวัล Top-N เมื่อห้องชนะบอส — 1 แถวต่อผู้เล่นที่ได้รางวัล. เขียนผ่าน distribute_boss_raid_rewards() (security definer) เท่านั้น.';

create index idx_boss_raid_rewards_session on public.boss_raid_rewards (session_id);
create index idx_boss_raid_rewards_participant on public.boss_raid_rewards (participant_id);
create index idx_boss_raid_rewards_user on public.boss_raid_rewards (user_id);

alter table public.boss_raid_rewards enable row level security;

create policy "boss_raid_rewards: member select" on public.boss_raid_rewards
  for select using (public.is_boss_raid_member(session_id));

alter publication supabase_realtime add table public.boss_raid_rewards;
alter table public.boss_raid_rewards replica identity full;

create or replace function public.distribute_boss_raid_rewards(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_config jsonb;
  v_egg_type_id text;
  v_top_n int;
  v_row record;
  v_player_egg_id uuid;
begin
  update public.boss_raid_sessions
    set reward_distributed_at = now()
    where id = p_session_id
      and result = 'win'
      and reward_distributed_at is null
    returning config into v_config;

  if not found then
    return;
  end if;

  v_egg_type_id := v_config ->> 'reward_egg_type_id';
  v_top_n       := nullif(v_config ->> 'reward_top_n', '')::int;

  if v_egg_type_id is null or v_top_n is null or v_top_n <= 0 then
    return;
  end if;

  if not exists (
    select 1 from public.egg_types
    where id = v_egg_type_id
      and tier in ('common', 'rare', 'epic')
      and is_obtainable = true
  ) then
    return;
  end if;

  for v_row in
    select p.id as participant_id, p.user_id, p.total_damage,
           row_number() over (order by p.total_damage desc, p.joined_at asc) as rnk
    from public.boss_raid_participants p
    where p.session_id = p_session_id
      and p.total_damage > 0
    order by p.total_damage desc, p.joined_at asc
    limit v_top_n
  loop
    insert into public.player_eggs (user_id, egg_type_id, source)
    values (v_row.user_id, v_egg_type_id, 'boss_raid_reward')
    returning id into v_player_egg_id;

    insert into public.boss_raid_rewards
      (session_id, participant_id, user_id, egg_type_id, player_egg_id, rank, total_damage)
    values
      (p_session_id, v_row.participant_id, v_row.user_id, v_egg_type_id, v_player_egg_id,
       v_row.rnk::int, v_row.total_damage)
    on conflict (session_id, participant_id) do nothing;
  end loop;
end;
$$;

comment on function public.distribute_boss_raid_rewards(uuid) is
  'แจกไข่รางวัล Top-N เมื่อห้องชนะบอส. idempotent (atomic claim ผ่าน reward_distributed_at). เรียกจาก submit_boss_raid_answer / submit_boss_raid_event_answer หลัง set result=win เท่านั้น.';

create or replace function public.get_boss_raid_rewards(p_session_id uuid)
returns table (
  participant_id uuid,
  rank int,
  total_damage int,
  egg_type_id text,
  egg_name_th text,
  sprite_prefix text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_boss_raid_member(p_session_id) then
    raise exception 'ไม่มีสิทธิ์';
  end if;

  return query
    select r.participant_id, r.rank, r.total_damage, r.egg_type_id, e.name_th, e.sprite_prefix
    from public.boss_raid_rewards r
    join public.egg_types e on e.id = r.egg_type_id
    where r.session_id = p_session_id
    order by r.rank asc;
end;
$$;

grant execute on function public.get_boss_raid_rewards(uuid) to authenticated;
