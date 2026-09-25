-- Migration: 20260925120000_teacher_classes_dashboard
-- หน้าแรกครู (แดชบอร์ด) + ห้องเรียนถาวร ("ม.3/1 วิทย์") ผูกคาบ → ดูย้อนหลังได้ว่าห้องนี้ทำอะไร ผลเป็นไง
--
--   1) teacher_classes — ห้องเรียนถาวรของครู (ชื่ออิสระ) ; classroom_sessions.class_id ชี้มา
--      backfill จาก classroom_sessions.title เดิม (จับคู่ตามชื่อ ไม่สนตัวพิมพ์/ช่องว่างหัวท้าย)
--   2) classroom_boss_raids — เดิมคาบจำแค่ active_boss_raid_session_id (Raid ล่าสุด) เล่น 2 รอบในคาบเดียว
--      รอบแรกหลุดจากประวัติ. ใช้ trigger บน classroom_sessions บันทึกทุก Raid ที่ผูกเข้าคาบ
--      (ไม่แก้ launch_boss_raid_from_classroom / ตาราง boss_raid_* เดิม) + backfill ตัวที่มีอยู่
--   3) start_class_session — กด "เริ่มคาบ" ที่การ์ดห้อง: มีคาบเปิดอยู่แล้วคืนตัวเดิม (ไม่เปิดซ้อน)
--      มีคาบห้องอื่นค้าง → raise other_session_open ให้ UI ถามครูก่อน แล้วเรียกซ้ำด้วย p_end_other_open
--   4) get_teacher_dashboard / get_teacher_class_detail — คืน jsonb ก้อนเดียวต่อหน้า (สรุปฝั่ง DB
--      เพราะครูอ่าน boss_raid_answers / focus participants ของนักเรียนตรงๆ ผ่าน RLS ไม่ได้)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 1) teacher_classes
-- ============================================================
create table public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index teacher_classes_teacher_name_uidx
  on public.teacher_classes (teacher_id, lower(btrim(name)))
  where archived_at is null;
alter table public.teacher_classes enable row level security;
create policy "teacher_classes: owner select"
  on public.teacher_classes for select
  using (teacher_id = auth.uid());

alter table public.classroom_sessions
  add column class_id uuid references public.teacher_classes(id);
create index classroom_sessions_class_id_idx on public.classroom_sessions (class_id, created_at desc);
create index classroom_sessions_teacher_created_idx on public.classroom_sessions (teacher_id, created_at desc);

-- backfill ห้องจากชื่อคาบเดิม
insert into public.teacher_classes (teacher_id, name, created_at)
select teacher_id, min(btrim(title)), min(created_at)
from public.classroom_sessions
where title is not null and btrim(title) <> ''
group by teacher_id, lower(btrim(title));

update public.classroom_sessions cs
set class_id = tc.id
from public.teacher_classes tc
where cs.title is not null
  and tc.teacher_id = cs.teacher_id
  and lower(btrim(tc.name)) = lower(btrim(cs.title));

-- ============================================================
-- 2) classroom_boss_raids — ทุก Raid ที่เปิดจากคาบ
-- ============================================================
create table public.classroom_boss_raids (
  classroom_session_id uuid not null references public.classroom_sessions(id),
  boss_raid_session_id uuid not null unique references public.boss_raid_sessions(id),
  linked_at timestamptz not null default now(),
  primary key (classroom_session_id, boss_raid_session_id)
);
alter table public.classroom_boss_raids enable row level security;
create policy "classroom_boss_raids: teacher select"
  on public.classroom_boss_raids for select
  using (exists (
    select 1 from public.classroom_sessions cs
    where cs.id = classroom_session_id and cs.teacher_id = auth.uid()
  ));

insert into public.classroom_boss_raids (classroom_session_id, boss_raid_session_id, linked_at)
select id, active_boss_raid_session_id, created_at
from public.classroom_sessions
where active_boss_raid_session_id is not null
on conflict do nothing;

create or replace function public.classroom_link_boss_raid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.classroom_boss_raids (classroom_session_id, boss_raid_session_id)
  values (new.id, new.active_boss_raid_session_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger classroom_sessions_link_boss_raid
  after insert or update of active_boss_raid_session_id on public.classroom_sessions
  for each row
  when (new.active_boss_raid_session_id is not null)
  execute function public.classroom_link_boss_raid();

revoke all on function public.classroom_link_boss_raid() from public, anon, authenticated;

-- ============================================================
-- 3) จัดการห้องเรียนถาวร
-- ============================================================
create or replace function public.create_teacher_class(p_name text)
returns public.teacher_classes
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
  v_class public.teacher_classes;
begin
  if not public.is_teacher() then
    raise exception 'not_authorized_teacher';
  end if;
  if v_name = '' then
    raise exception 'invalid_class_name';
  end if;

  begin
    insert into public.teacher_classes (teacher_id, name)
    values (auth.uid(), v_name)
    returning * into v_class;
  exception when unique_violation then
    raise exception 'class_name_taken';
  end;

  return v_class;
end;
$$;

grant execute on function public.create_teacher_class(text) to authenticated;

create or replace function public.rename_teacher_class(p_class_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
begin
  if v_name = '' then
    raise exception 'invalid_class_name';
  end if;

  begin
    update public.teacher_classes
    set name = v_name
    where id = p_class_id and teacher_id = auth.uid();
  exception when unique_violation then
    raise exception 'class_name_taken';
  end;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;

  -- ชื่อคาบ (โชว์บนจอห้อง/หน้านักเรียน) ตามชื่อห้อง
  update public.classroom_sessions set title = v_name where class_id = p_class_id;
end;
$$;

grant execute on function public.rename_teacher_class(uuid, text) to authenticated;

create or replace function public.archive_teacher_class(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.teacher_classes
  set archived_at = now()
  where id = p_class_id and teacher_id = auth.uid() and archived_at is null;

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
end;
$$;

grant execute on function public.archive_teacher_class(uuid) to authenticated;

create or replace function public.start_class_session(
  p_class_id uuid,
  p_end_other_open boolean default false
)
returns public.classroom_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_class public.teacher_classes;
  v_session public.classroom_sessions;
begin
  if not public.is_teacher() then
    raise exception 'not_authorized_teacher';
  end if;

  select * into v_class
  from public.teacher_classes
  where id = p_class_id and teacher_id = auth.uid() and archived_at is null;
  if v_class.id is null then
    raise exception 'not_authorized_or_not_found';
  end if;

  perform public.expire_stale_classroom_sessions();

  -- คาบของห้องนี้ยังเปิดอยู่ → กลับเข้าห้องเดิม รหัสเดิม
  select * into v_session
  from public.classroom_sessions
  where class_id = p_class_id and status <> 'ended'
  order by created_at desc
  limit 1;
  if v_session.id is not null then
    return v_session;
  end if;

  if exists (
    select 1 from public.classroom_sessions
    where teacher_id = auth.uid() and status <> 'ended'
  ) then
    if not p_end_other_open then
      raise exception 'other_session_open';
    end if;
    update public.classroom_sessions
    set status = 'ended', ended_at = now(), current_activity = null
    where teacher_id = auth.uid() and status <> 'ended';
  end if;

  insert into public.classroom_sessions (teacher_id, join_code, status, title, class_id)
  values (auth.uid(), public.gen_classroom_join_code(), 'lobby', v_class.name, v_class.id)
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.start_class_session(uuid, boolean) to authenticated;

-- ============================================================
-- 4) สรุปผลรายคาบ (ใช้ภายใน RPC เท่านั้น)
-- ============================================================
create or replace function public.classroom_session_summary(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', cs.id,
    'title', coalesce(tc.name, cs.title),
    'class_id', cs.class_id,
    'join_code', cs.join_code,
    'status', cs.status,
    'created_at', cs.created_at,
    'ended_at', cs.ended_at,
    'participants', (select count(*) from public.classroom_participants cp where cp.session_id = cs.id),
    'raids', coalesce((
      select jsonb_agg(jsonb_build_object(
        'result', b.result,
        'status', b.status,
        'correct', (select count(*) from public.boss_raid_answers a where a.session_id = b.id and a.is_correct),
        'answers', (select count(*) from public.boss_raid_answers a where a.session_id = b.id)
      ) order by b.created_at)
      from public.classroom_boss_raids cbr
      join public.boss_raid_sessions b on b.id = cbr.boss_raid_session_id
      where cbr.classroom_session_id = cs.id
    ), '[]'::jsonb),
    'focus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'minutes', round(extract(epoch from coalesce(f.ended_at, now()) - f.started_at) / 60),
        'running', f.status = 'running',
        'participants', (select count(*) from public.classroom_focus_participants fp where fp.focus_session_id = f.id)
      ) order by f.started_at)
      from public.classroom_focus_sessions f
      where f.classroom_session_id = cs.id
    ), '[]'::jsonb),
    'picks', (select count(*) from public.classroom_name_picker_log l where l.session_id = cs.id)
  )
  from public.classroom_sessions cs
  left join public.teacher_classes tc on tc.id = cs.class_id
  where cs.id = p_session_id;
$$;

revoke all on function public.classroom_session_summary(uuid) from public, anon, authenticated;

-- ============================================================
-- 5) get_teacher_dashboard — หน้าแรกครู
-- ============================================================
create or replace function public.get_teacher_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_teacher() then
    raise exception 'not_authorized_teacher';
  end if;

  perform public.expire_stale_classroom_sessions();

  return jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'stats', (
      select jsonb_build_object(
        'sessions', (select count(*) from public.classroom_sessions cs
                     where cs.teacher_id = v_uid and cs.created_at >= v_since),
        'students', (select count(distinct cp.user_id)
                     from public.classroom_participants cp
                     join public.classroom_sessions cs on cs.id = cp.session_id
                     where cs.teacher_id = v_uid and cs.created_at >= v_since),
        'raid_answers', coalesce(r.total, 0),
        'raid_correct', coalesce(r.correct, 0),
        'focus_seconds', (select coalesce(sum(fp.focused_seconds), 0)
                          from public.classroom_focus_participants fp
                          join public.classroom_focus_sessions fs on fs.id = fp.focus_session_id
                          where fs.teacher_id = v_uid and fs.started_at >= v_since)
      )
      from (
        select count(*) as total, count(*) filter (where a.is_correct) as correct
        from public.classroom_boss_raids cbr
        join public.classroom_sessions cs on cs.id = cbr.classroom_session_id
        join public.boss_raid_answers a on a.session_id = cbr.boss_raid_session_id
        where cs.teacher_id = v_uid and cs.created_at >= v_since
      ) r
    ),
    'classes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.last_session_at desc nulls last, c.created_at desc)
      from (
        select
          tc.id,
          tc.name,
          tc.created_at,
          (select count(*) from public.classroom_sessions cs where cs.class_id = tc.id) as session_count,
          (select max(cs.created_at) from public.classroom_sessions cs where cs.class_id = tc.id) as last_session_at,
          (select count(distinct cp.user_id)
             from public.classroom_participants cp
             join public.classroom_sessions cs on cs.id = cp.session_id
             where cs.class_id = tc.id) as student_count,
          (select count(*)
             from public.classroom_boss_raids cbr
             join public.classroom_sessions cs on cs.id = cbr.classroom_session_id
             join public.boss_raid_answers a on a.session_id = cbr.boss_raid_session_id
             where cs.class_id = tc.id) as raid_answers,
          (select count(*)
             from public.classroom_boss_raids cbr
             join public.classroom_sessions cs on cs.id = cbr.classroom_session_id
             join public.boss_raid_answers a on a.session_id = cbr.boss_raid_session_id
             where cs.class_id = tc.id and a.is_correct) as raid_correct,
          (select jsonb_build_object(
                    'id', cs.id,
                    'join_code', cs.join_code,
                    'participants', (select count(*) from public.classroom_participants cp where cp.session_id = cs.id))
             from public.classroom_sessions cs
             where cs.class_id = tc.id and cs.status <> 'ended'
             order by cs.created_at desc
             limit 1) as open_session
        from public.teacher_classes tc
        where tc.teacher_id = v_uid and tc.archived_at is null
      ) c
    ), '[]'::jsonb),
    'open_sessions', coalesce((
      select jsonb_agg(public.classroom_session_summary(cs.id) order by cs.created_at desc)
      from public.classroom_sessions cs
      where cs.teacher_id = v_uid and cs.status <> 'ended'
    ), '[]'::jsonb),
    'recent_sessions', coalesce((
      select jsonb_agg(public.classroom_session_summary(x.id) order by x.created_at desc)
      from (
        select cs.id, cs.created_at
        from public.classroom_sessions cs
        where cs.teacher_id = v_uid
        order by cs.created_at desc
        limit 10
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_teacher_dashboard(integer) to authenticated;

-- ============================================================
-- 6) get_teacher_class_detail — หน้าห้อง ม.3/1: คาบทั้งหมด, นักเรียนรายคน, บทที่อ่อน
-- ============================================================
create or replace function public.get_teacher_class_detail(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_class public.teacher_classes;
  v_total_sessions integer;
begin
  select * into v_class
  from public.teacher_classes
  where id = p_class_id and teacher_id = auth.uid();
  if v_class.id is null then
    raise exception 'not_authorized_or_not_found';
  end if;

  perform public.expire_stale_classroom_sessions();

  select count(*) into v_total_sessions
  from public.classroom_sessions where class_id = p_class_id;

  return jsonb_build_object(
    'class', jsonb_build_object(
      'id', v_class.id, 'name', v_class.name,
      'created_at', v_class.created_at, 'archived_at', v_class.archived_at
    ),
    'total_sessions', v_total_sessions,
    'sessions', coalesce((
      select jsonb_agg(public.classroom_session_summary(x.id) order by x.created_at desc)
      from (
        select cs.id, cs.created_at from public.classroom_sessions cs
        where cs.class_id = p_class_id
        order by cs.created_at desc
        limit 50
      ) x
    ), '[]'::jsonb),
    'students', coalesce((
      with class_sessions as (
        select id from public.classroom_sessions where class_id = p_class_id
      ),
      class_raids as (
        select cbr.boss_raid_session_id as raid_id
        from public.classroom_boss_raids cbr
        where cbr.classroom_session_id in (select id from class_sessions)
      ),
      members as (
        select cp.user_id,
               count(*) as attended,
               max(cp.joined_at) as last_seen
        from public.classroom_participants cp
        where cp.session_id in (select id from class_sessions)
        group by cp.user_id
      )
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'username', pr.username,
        'display_name', ident.display_name,
        'student_number', ident.student_number,
        'attended', m.attended,
        'last_seen', m.last_seen,
        'raid_answers', coalesce(ra.total, 0),
        'raid_correct', coalesce(ra.correct, 0),
        'focus_seconds', coalesce(fo.secs, 0),
        'picked', coalesce(pk.n, 0),
        'pet_nickname', pet.nickname,
        'pet_stage', pet.stage,
        'pet_subline', pet.subline,
        'pet_personality', pet.personality,
        'pet_sprite_prefix', et.sprite_prefix,
        'pet_egg_name_th', et.name_th
      ))
      from members m
      left join public.profiles pr on pr.id = m.user_id
      left join lateral (
        select
          (select cp.display_name from public.classroom_participants cp
             where cp.user_id = m.user_id and cp.session_id in (select id from class_sessions)
               and cp.display_name is not null
             order by cp.joined_at desc limit 1) as display_name,
          (select cp.student_number from public.classroom_participants cp
             where cp.user_id = m.user_id and cp.session_id in (select id from class_sessions)
               and cp.student_number is not null
             order by cp.joined_at desc limit 1) as student_number
      ) ident on true
      left join lateral (
        select count(*) as total, count(*) filter (where a.is_correct) as correct
        from public.boss_raid_participants bp
        join public.boss_raid_answers a on a.participant_id = bp.id
        where bp.user_id = m.user_id and bp.session_id in (select raid_id from class_raids)
      ) ra on true
      left join lateral (
        select sum(fp.focused_seconds) as secs
        from public.classroom_focus_participants fp
        join public.classroom_focus_sessions fs on fs.id = fp.focus_session_id
        where fp.user_id = m.user_id and fs.classroom_session_id in (select id from class_sessions)
      ) fo on true
      left join lateral (
        select count(*) as n
        from public.classroom_name_picker_log l
        where l.picked_user_id = m.user_id and l.session_id in (select id from class_sessions)
      ) pk on true
      left join lateral (
        select p.nickname, p.stage, p.subline, p.personality, p.egg_type_id
        from public.pets p
        where p.user_id = m.user_id and p.is_active
        limit 1
      ) pet on true
      left join public.egg_types et on et.id = pet.egg_type_id
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.correct::numeric / nullif(t.answers, 0) asc, t.answers desc)
      from (
        select q.subject, q.chapter,
               count(*) as answers,
               count(*) filter (where a.is_correct) as correct
        from public.classroom_boss_raids cbr
        join public.classroom_sessions cs on cs.id = cbr.classroom_session_id
        join public.boss_raid_answers a on a.session_id = cbr.boss_raid_session_id
        join public.questions q on q.id = a.question_id
        where cs.class_id = p_class_id and q.chapter is not null
        group by q.subject, q.chapter
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_teacher_class_detail(uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   drop function if exists public.get_teacher_class_detail(uuid);
--   drop function if exists public.get_teacher_dashboard(integer);
--   drop function if exists public.classroom_session_summary(uuid);
--   drop function if exists public.start_class_session(uuid, boolean);
--   drop function if exists public.archive_teacher_class(uuid);
--   drop function if exists public.rename_teacher_class(uuid, text);
--   drop function if exists public.create_teacher_class(text);
--   drop trigger if exists classroom_sessions_link_boss_raid on public.classroom_sessions;
--   drop function if exists public.classroom_link_boss_raid();
--   drop table if exists public.classroom_boss_raids;
--   alter table public.classroom_sessions drop column class_id;
--   drop index if exists public.classroom_sessions_teacher_created_idx;
--   drop table if exists public.teacher_classes;
-- ============================================================
