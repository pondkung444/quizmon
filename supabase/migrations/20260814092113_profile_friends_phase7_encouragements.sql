-- ============================================================
-- 1) encouragements.read_at — ใช้ตัดสินจุดสีส้มบนปุ่ม "สังคม" (§8.1)
-- ============================================================
alter table public.encouragements add column read_at timestamptz;

-- ============================================================
-- 2) send_encouragement — ส่งกำลังใจ (§8.2) เพื่อนกันเท่านั้น, cap วันละ 1 ครั้ง/คน (unique constraint
--    เดิมจากเฟส 0 จัดการให้), sent_date คำนวณฝั่ง SQL เป็นวันที่ไทยเสมอ ห้ามรับจาก client
-- ============================================================
create or replace function public.send_encouragement(p_recipient_id uuid, p_message_key text)
returns table(encouragement_id uuid, sent_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_sent_date date;
  v_new_id uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if p_recipient_id = v_me then
    raise exception 'ส่งกำลังใจหาตัวเองไม่ได้';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_id_low = least(v_me, p_recipient_id) and user_id_high = greatest(v_me, p_recipient_id)
  ) then
    raise exception 'ส่งกำลังใจได้เฉพาะเพื่อนเท่านั้น';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_recipient_id) or (blocker_id = p_recipient_id and blocked_id = v_me)
  ) then
    raise exception 'ส่งกำลังใจไม่สำเร็จ';
  end if;

  v_sent_date := (now() at time zone 'Asia/Bangkok')::date;

  begin
    insert into public.encouragements (sender_id, recipient_id, message_key, sent_date)
    values (v_me, p_recipient_id, p_message_key, v_sent_date)
    returning id into v_new_id;
  exception when unique_violation then
    raise exception 'ส่งกำลังใจให้เพื่อนคนนี้ไปแล้ววันนี้';
  end;

  return query select v_new_id, v_sent_date;
end;
$$;

grant execute on function public.send_encouragement(uuid, text) to authenticated;

-- ============================================================
-- 3) has_sent_encouragement_today — ให้ S05 รู้ทันทีตอนโหลดหน้าว่าปุ่มควร disabled ไหม โดยไม่ต้อง
--    แก้ signature ของ get_friend_profile (เฟส 6) เรียกคู่กันแบบ Promise.all แทน
-- ============================================================
create or replace function public.has_sent_encouragement_today(p_recipient_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.encouragements
    where sender_id = auth.uid() and recipient_id = p_recipient_id
      and sent_date = (now() at time zone 'Asia/Bangkok')::date
  );
$$;

grant execute on function public.has_sent_encouragement_today(uuid) to authenticated;

-- ============================================================
-- 4) list_encouragements_received — ย้อนหลัง 7 วันสำหรับ S08 + mark ทุกแถวที่ยังไม่อ่านเป็นอ่านแล้วทันที
--    (ไม่จำกัดแค่ 7 วันที่แสดง กันจุดแจ้งเตือนค้างถ้ามีข้อความเก่ากว่านั้นที่ไม่เคยถูกอ่าน)
-- ============================================================
create or replace function public.list_encouragements_received()
returns table(
  encouragement_id uuid,
  sender_id uuid,
  sender_username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  message_key text,
  sent_date date,
  already_sent_back_today boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  update public.encouragements
  set read_at = now()
  where recipient_id = v_me and read_at is null;

  return query
  with received as (
    select e.id, e.sender_id, e.message_key, e.sent_date
    from public.encouragements e
    where e.recipient_id = v_me and e.sent_date >= v_today - 7
  ),
  pride as (
    select r.id, r.sender_id, r.message_key, r.sent_date,
      coalesce(ps.pride_pet_id, ap.id) as pride_pet_id
    from received r
    left join public.profile_settings ps on ps.user_id = r.sender_id
    left join public.pets ap on ap.user_id = r.sender_id and ap.is_active = true and ps.pride_pet_id is null
  )
  select pd.id, pd.sender_id, pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    pd.message_key, pd.sent_date,
    exists (
      select 1 from public.encouragements back
      where back.sender_id = v_me and back.recipient_id = pd.sender_id and back.sent_date = v_today
    )
  from pride pd
  join public.profiles pr on pr.id = pd.sender_id
  left join public.pets pt on pt.id = pd.pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  order by pd.sent_date desc, pd.id desc;
end;
$$;

grant execute on function public.list_encouragements_received() to authenticated;

-- ============================================================
-- 5) get_unread_encouragement_count — จุดสีส้มบน BottomNav.tsx
-- ============================================================
create or replace function public.get_unread_encouragement_count()
returns int
language sql
stable security definer
set search_path = public
as $$
  select count(*)::int from public.encouragements where recipient_id = auth.uid() and read_at is null;
$$;

grant execute on function public.get_unread_encouragement_count() to authenticated;
