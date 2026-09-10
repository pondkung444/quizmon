-- Additive rollout. Apply before RAID_CARD_BATTLES_ENABLED=true.
-- Existing runs/RPCs retain their rules; card phases cannot use legacy quiz RPCs.
create table public.raid_card_battles (
  run_id uuid primary key references public.raid_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  raid_type_id uuid not null references public.raid_types(id),
  revision integer not null default 0 check (revision >= 0),
  state jsonb,
  progress integer not null default 0 check (progress between 0 and 100),
  finished_at timestamptz,
  check (state is null or state->>'version' = '2')
);
alter table public.raid_card_battles enable row level security;
revoke all on public.raid_card_battles from public, anon, authenticated;
grant select on public.raid_card_battles to authenticated;
grant all on public.raid_card_battles to service_role;
create policy raid_card_battles_owner_read on public.raid_card_battles for select to authenticated
  using ((select auth.uid()) = user_id);
create index raid_card_battles_best on public.raid_card_battles(user_id, raid_type_id, progress desc)
  where finished_at is not null;

create function public.start_raid_card_run(p_pet_id uuid, p_raid_type_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_run public.raid_runs;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'เข้าสู่ระบบก่อนท้าทาย';
  end if;
  -- Serialize starts/retries for this player before consuming a key.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 9210));
  select * into v_run from public.raid_runs
    where user_id = v_user and status = 'in_progress' limit 1 for update;
  if found then
    if v_run.phase in ('card_battle','card_reward') then return v_run.id; end if;
    raise exception 'เล่นรอบเดิมให้จบก่อนเริ่มรอบใหม่';
  end if;
  if not exists (select 1 from public.raid_types where id = p_raid_type_id
    and slug in ('ridge_mist','ridge_gale','ridge_storm') and is_active) then
    raise exception 'ไม่พบด่านการ์ดนี้';
  end if;
  -- Reuse verified ownership, stage, sequential unlock, gear/cap snapshot and ticket rules.
  v_run := public.start_raid_run(p_pet_id, p_raid_type_id);
  delete from public.raid_run_steps where run_id = v_run.id;
  update public.raid_runs set phase = 'card_battle', gauge_max = 100, gauge_earned = 0,
    fail_count = 0 where id = v_run.id;
  insert into public.raid_card_battles(run_id, user_id, raid_type_id)
    values (v_run.id, v_user, p_raid_type_id);
  return v_run.id;
end;
$$;
revoke all on function public.start_raid_card_run(uuid,uuid) from public, anon;
grant execute on function public.start_raid_card_run(uuid,uuid) to authenticated;

-- Only trusted server code resolves the pure combat engine. Browser roles cannot invoke this
-- function or write state directly. CAS also covers lost responses, duplicate clicks and tabs.
create function public.commit_raid_card_turn(p_run_id uuid, p_user_id uuid, p_revision integer, p_state jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_b public.raid_card_battles;
  v_run public.raid_runs;
  v_turn integer;
  v_hp integer;
  v_boss_hp integer;
  v_boss_max integer;
  v_progress integer;
  v_score integer;
  v_outcome text;
begin
  select * into v_run from public.raid_runs where id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบรอบท้าทาย'; end if;
  select * into v_b from public.raid_card_battles where run_id=p_run_id and user_id=p_user_id for update;
  if not found then raise exception 'ไม่พบสนาม'; end if;
  if p_revision is null then raise exception 'Missing revision'; end if;
  if v_b.revision <> p_revision or v_b.finished_at is not null then
    return jsonb_build_object('revision',v_b.revision,'state',v_b.state);
  end if;
  if v_run.status <> 'in_progress' or v_run.phase <> 'card_battle' then raise exception 'รอบนี้จบแล้ว'; end if;
  if p_state is null or (p_state->>'version') is distinct from '2' then raise exception 'Invalid ruleset'; end if;
  if p_state->'stats' is distinct from v_run.stat_snapshot then raise exception 'Snapshot mismatch'; end if;
  if not exists(select 1 from public.raid_types where id=v_run.raid_type_id and slug=p_state->>'bossId') then
    raise exception 'Boss mismatch';
  end if;
  v_boss_max := case p_state->>'bossId' when 'ridge_mist' then 200 when 'ridge_gale' then 270 when 'ridge_storm' then 430 else null end;
  v_turn := (p_state->>'turn')::integer;
  v_hp := (p_state->>'hp')::integer;
  v_boss_hp := (p_state->>'bossHp')::integer;
  v_outcome := p_state->>'outcome';
  if not (p_state ?& array['hpMax','hand','energy','log','outcome'])
    or jsonb_typeof(p_state->'hand') is distinct from 'array'
    or jsonb_typeof(p_state->'log') is distinct from 'array'
    or jsonb_typeof(p_state->'hpMax') is distinct from 'number'
    or jsonb_typeof(p_state->'energy') is distinct from 'number' then raise exception 'Incomplete combat state'; end if;
  if v_turn is null or v_turn not between 1 and 20 or v_hp is null or v_hp < 0
    or v_hp > (p_state->>'hpMax')::integer or v_boss_hp is null or v_boss_hp not between 0 and v_boss_max
    or (p_state->>'hpMax')::integer <> 80 + round((v_run.stat_snapshot->>'hp')::numeric * 1.5)::integer
    or jsonb_array_length(p_state->'hand') <> 3 or (p_state->>'energy')::integer not between 0 and 5 then
    raise exception 'Invalid combat state';
  end if;
  if v_b.state is null then
    if v_turn <> 1 or v_outcome is not null or jsonb_array_length(p_state->'log') <> 0
      or v_hp <> (p_state->>'hpMax')::integer or v_boss_hp <> v_boss_max then raise exception 'Invalid initial state'; end if;
  else
    if jsonb_array_length(p_state->'log') <> jsonb_array_length(v_b.state->'log') + 1
      or v_turn <> (v_b.state->>'turn')::integer + (case when v_outcome is null then 1 else 0 end) then
      raise exception 'Invalid turn sequence';
    end if;
  end if;
  if v_outcome is not null and v_outcome not in ('win','defeat') then raise exception 'Invalid outcome'; end if;
  if (v_outcome = 'win' and v_boss_hp <> 0)
    or (v_outcome = 'defeat' and v_boss_hp > 0 and v_hp > 0 and v_turn < 20)
    or (v_outcome is null and (v_hp = 0 or v_boss_hp = 0)) then raise exception 'Invalid end condition'; end if;
  v_progress := round((1 - v_boss_hp::numeric / v_boss_max) * 100)::integer;
  if v_outcome is not null then
    v_score := case when v_outcome='win' then least(100,80+round(20*v_hp::numeric/(p_state->>'hpMax')::integer)::integer)
      else least(79,v_progress) end;
    -- Existing reward RPC consumes score and outcome; no quiz/stat gate and no EXP awarded.
    update public.raid_runs set phase='card_reward', outcome=case when v_outcome='win' then 'win' when p_state->>'defeatReason'='stats' then 'lose_stat' when p_state->>'defeatReason'='learning' then 'lose_quiz' else 'lose_battle' end,
      gauge_earned=v_score, gauge_max=100, fail_count=0 where id=p_run_id;
  end if;
  update public.raid_card_battles set state=p_state, revision=revision+1, progress=v_progress,
    finished_at=case when v_outcome is not null then now() else null end where run_id=p_run_id
    returning * into v_b;
  return jsonb_build_object('revision',v_b.revision,'state',v_b.state);
end;
$$;
revoke all on function public.commit_raid_card_turn(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.commit_raid_card_turn(uuid,uuid,integer,jsonb) to service_role;

create function public.claim_raid_card_reward(p_run_id uuid)
returns table(gear_id uuid,slot text,main_stat text,main_value integer,sub_stat text,sub_value integer,
  quality text,egg_awarded boolean,egg_type_id text,egg_name_th text,pity_meter integer)
language plpgsql security definer set search_path = '' as $$
declare v_run public.raid_runs;
begin
  if auth.uid() is null then raise exception 'เข้าสู่ระบบก่อน'; end if;
  select * into v_run from public.raid_runs where id=p_run_id and user_id=auth.uid() for update;
  if not found or not exists(select 1 from public.raid_card_battles where run_id=p_run_id and finished_at is not null) then
    raise exception 'ยังรับรางวัลไม่ได้';
  end if;
  if v_run.phase='card_reward' and v_run.gear_item_id is null then
    update public.raid_runs set phase='reward' where id=p_run_id;
  end if;
  -- Atomic delegation preserves first-clear, pity, gear rolls and idempotency exactly.
  return query select * from public.claim_raid_reward(p_run_id);
end;
$$;
revoke all on function public.claim_raid_card_reward(uuid) from public, anon;
grant execute on function public.claim_raid_card_reward(uuid) to authenticated;
