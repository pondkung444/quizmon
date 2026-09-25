-- Migration: 20260925150000_classroom_student_lobby_v3
-- หน้าห้องฝั่งนักเรียน รอบ 3 — เลือก Qmon ประจำคาบ + ดูว่าคาบนี้ทำอะไรไปแล้ว ได้อะไรมา
--
--   1) classroom_participants.pet_id — Qmon ที่นักเรียนเลือกลงคาบนี้ (stage 4 ของตัวเอง, null = ตัวที่เลี้ยงอยู่)
--      ไม่ใช้ pets.is_active เพราะนั่นคือตัวที่กำลังเลี้ยง/โตจาก quiz — สลับแล้วการเลี้ยงพัง
--   2) set_classroom_pet — ตั้ง/ล้าง Qmon ประจำคาบ (ห้องยังไม่จบ)
--   3) join_classroom_session — prefill pet_id จากคาบล่าสุด (เหมือนชื่อ) เด็กไม่ต้องเลือกใหม่ทุกคาบ
--   4) get_classroom_roster — โชว์ Qmon ประจำคาบก่อน ไม่มีค่อย fallback ตัวที่เลี้ยงอยู่ (signature เดิม)
--   5) join_boss_raid_session — Raid ที่เปิดจากคาบ ใช้ Qmon ประจำคาบ แทน is_active
--      (ยังสลับตัวได้ที่หน้ารอ Raid ผ่าน select_boss_raid_pet เหมือนเดิม)
--   6) get_classroom_my_summary — ผลของ "ฉัน" ในคาบนี้: Raid (ตอบถูก/อันดับ/ไข่), คาบตั้งใจ (นาที/EXP), ถูกสุ่มชื่อ

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) คอลัมน์
-- ============================================================
alter table public.classroom_participants
  add column pet_id uuid references public.pets(id) on delete set null;

-- ============================================================
-- 2) set_classroom_pet
-- ============================================================
create or replace function public.set_classroom_pet(p_session_id uuid, p_pet_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and status <> 'ended'
  ) then
    raise exception 'not_authorized_or_not_found';
  end if;

  if p_pet_id is not null and not exists (
    select 1 from public.pets
    where id = p_pet_id and user_id = auth.uid() and stage >= 4
  ) then
    raise exception 'invalid_classroom_pet';
  end if;

  update public.classroom_participants
  set pet_id = p_pet_id
  where session_id = p_session_id and user_id = auth.uid();

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
end;
$$;

grant execute on function public.set_classroom_pet(uuid, uuid) to authenticated;

-- ============================================================
-- 3) join_classroom_session — + prefill pet_id
-- ============================================================
create or replace function public.join_classroom_session(p_join_code text)
returns public.classroom_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session public.classroom_sessions;
  v_code text := regexp_replace(upper(coalesce(p_join_code, '')), '[^A-Z0-9]', '', 'g');
  v_name text;
  v_number smallint;
  v_pet uuid;
begin
  perform public.expire_stale_classroom_sessions();

  select * into v_session
  from public.classroom_sessions
  where join_code = v_code and status <> 'ended';

  if v_session.id is null then
    raise exception 'classroom_not_found';
  end if;

  if exists (
    select 1 from public.classroom_kicked
    where session_id = v_session.id and user_id = auth.uid()
  ) then
    raise exception 'classroom_kicked';
  end if;

  -- prefill: ชื่อจากห้องล่าสุดที่เคยกรอก, เลขที่เฉพาะห้องของครูคนเดิม (ครูคนอื่น = ห้อง/เลขที่อื่น)
  select cp.display_name into v_name
  from public.classroom_participants cp
  where cp.user_id = auth.uid() and cp.display_name is not null
  order by cp.joined_at desc
  limit 1;

  select cp.student_number into v_number
  from public.classroom_participants cp
  join public.classroom_sessions cs on cs.id = cp.session_id
  where cp.user_id = auth.uid()
    and cs.teacher_id = v_session.teacher_id
    and cp.student_number is not null
  order by cp.joined_at desc
  limit 1;

  -- Qmon ประจำคาบล่าสุด (on delete set null ของ pets ดูแลกรณีตัวหายไปแล้ว)
  select cp.pet_id into v_pet
  from public.classroom_participants cp
  where cp.user_id = auth.uid() and cp.pet_id is not null
  order by cp.joined_at desc
  limit 1;

  insert into public.classroom_participants (session_id, user_id, display_name, student_number, pet_id)
  values (v_session.id, auth.uid(), v_name, v_number, v_pet)
  on conflict (session_id, user_id) do nothing;

  return v_session;
end;
$$;

grant execute on function public.join_classroom_session(text) to authenticated;

-- ============================================================
-- 4) get_classroom_roster — Qmon ประจำคาบก่อน แล้วค่อยตัวที่เลี้ยงอยู่
-- ============================================================
create or replace function public.get_classroom_roster(p_session_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  student_number smallint,
  joined_at timestamptz,
  pet_nickname text,
  pet_stage smallint,
  pet_subline text,
  pet_personality text,
  pet_sprite_prefix text,
  pet_egg_name_th text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_is_teacher boolean;
begin
  select exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and teacher_id = auth.uid()
  ) into v_is_teacher;

  if not v_is_teacher and not public.is_classroom_member(p_session_id) then
    raise exception 'not_authorized_or_not_found';
  end if;

  return query
    select
      cp.user_id,
      pr.username,
      case when v_is_teacher or cp.user_id = auth.uid() then cp.display_name end,
      case when v_is_teacher or cp.user_id = auth.uid() then cp.student_number end,
      cp.joined_at,
      pet.nickname,
      pet.stage,
      pet.subline,
      pet.personality,
      et.sprite_prefix,
      et.name_th
    from public.classroom_participants cp
    left join public.profiles pr on pr.id = cp.user_id
    left join lateral (
      select p.nickname, p.stage, p.subline, p.personality, p.egg_type_id
      from public.pets p
      where p.user_id = cp.user_id
        and (p.id = cp.pet_id or p.is_active)
      order by coalesce(p.id = cp.pet_id, false) desc
      limit 1
    ) pet on true
    left join public.egg_types et on et.id = pet.egg_type_id
    where cp.session_id = p_session_id
    order by cp.joined_at desc;
end;
$$;

grant execute on function public.get_classroom_roster(uuid) to authenticated;

-- ============================================================
-- 5) join_boss_raid_session — Raid จากคาบใช้ Qmon ประจำคาบ
-- ============================================================
create or replace function public.join_boss_raid_session(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.boss_raid_sessions;
  v_pet public.pets;
  v_participant public.boss_raid_participants;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_session
  from public.boss_raid_sessions
  where join_code = upper(btrim(p_join_code));

  if not found then
    raise exception 'ไม่พบรหัสห้องนี้';
  end if;

  if v_session.status not in ('lobby', 'in_progress') then
    raise exception 'ห้องนี้ปิดรับผู้เล่นแล้ว';
  end if;

  select * into v_participant
  from public.boss_raid_participants
  where session_id = v_session.id and user_id = v_user_id;

  if not found then
    -- Raid ที่เปิดจากคาบ (classroom_boss_raids) → Qmon ที่นักเรียนเลือกไว้ในคาบนั้น
    select p.* into v_pet
    from public.classroom_boss_raids cbr
    join public.classroom_participants cp
      on cp.session_id = cbr.classroom_session_id and cp.user_id = v_user_id
    join public.pets p on p.id = cp.pet_id and p.user_id = v_user_id and p.stage >= 4
    where cbr.boss_raid_session_id = v_session.id
    limit 1;

    if not found then
      select * into v_pet
      from public.pets
      where user_id = v_user_id and is_active = true
      limit 1;
    end if;

    if v_pet.id is null then
      raise exception 'ยังไม่มีสัตว์เลี้ยงที่ใช้งานอยู่';
    end if;

    insert into public.boss_raid_participants (session_id, user_id, pet_id, stat_snapshot)
    values (
      v_session.id,
      v_user_id,
      v_pet.id,
      public.compute_boss_raid_stat_snapshot(v_pet.id)
    )
    returning * into v_participant;
  end if;

  return jsonb_build_object(
    'session_id',    v_session.id,
    'status',        v_session.status,
    'join_code',     v_session.join_code,
    'config',        v_session.config,
    'participant_id', v_participant.id,
    'pet_id',        v_participant.pet_id,
    'stat_snapshot', v_participant.stat_snapshot
  );
end;
$$;

grant execute on function public.join_boss_raid_session(text) to authenticated;

-- ============================================================
-- 6) get_classroom_my_summary — ผลของตัวเองในคาบนี้
-- ============================================================
create or replace function public.get_classroom_my_summary(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_classroom_member(p_session_id) then
    raise exception 'not_authorized_or_not_found';
  end if;

  return jsonb_build_object(
    'pet_id', (
      select cp.pet_id from public.classroom_participants cp
      where cp.session_id = p_session_id and cp.user_id = v_uid
    ),
    'raids', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'status', b.status,
        'result', b.result,
        'at', coalesce(b.started_at, b.created_at),
        'joined', bp.id is not null,
        'answers', (select count(*) from public.boss_raid_answers a where a.participant_id = bp.id),
        'correct', (select count(*) from public.boss_raid_answers a where a.participant_id = bp.id and a.is_correct),
        'players', (select count(*) from public.boss_raid_participants x where x.session_id = b.id),
        'reward', (
          select jsonb_build_object('rank', r.rank, 'egg_name_th', et.name_th, 'sprite_prefix', et.sprite_prefix)
          from public.boss_raid_rewards r
          join public.egg_types et on et.id = r.egg_type_id
          where r.session_id = b.id and r.user_id = v_uid
          limit 1
        )
      ) order by b.created_at)
      from public.classroom_boss_raids cbr
      join public.boss_raid_sessions b on b.id = cbr.boss_raid_session_id
      left join public.boss_raid_participants bp on bp.session_id = b.id and bp.user_id = v_uid
      where cbr.classroom_session_id = p_session_id
    ), '[]'::jsonb),
    'focus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'running', f.status = 'running',
        'at', f.started_at,
        'minutes', round(extract(epoch from coalesce(f.ended_at, now()) - f.started_at) / 60),
        'joined', fp.user_id is not null,
        'focused_seconds', coalesce(fp.focused_seconds, 0),
        'exp', coalesce(fp.exp_awarded, 0)
      ) order by f.started_at)
      from public.classroom_focus_sessions f
      left join public.classroom_focus_participants fp on fp.focus_session_id = f.id and fp.user_id = v_uid
      where f.classroom_session_id = p_session_id
    ), '[]'::jsonb),
    'picks_total', (select count(*) from public.classroom_name_picker_log l where l.session_id = p_session_id),
    'picked_me', (
      select count(*) from public.classroom_name_picker_log l
      where l.session_id = p_session_id and l.picked_user_id = v_uid
    )
  );
end;
$$;

grant execute on function public.get_classroom_my_summary(uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   drop function if exists public.get_classroom_my_summary(uuid);
--   -- join_boss_raid_session: คืนตัวเดิมจาก 20260903120000 ข้อ 2
--   -- get_classroom_roster / join_classroom_session: คืนตัวเดิมจาก 20260925090000
--   drop function if exists public.set_classroom_pet(uuid, uuid);
--   alter table public.classroom_participants drop column pet_id;
-- ============================================================
