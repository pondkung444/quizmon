-- guardian_open_to_primary
-- เปิดระบบผู้พิทักษ์ให้ประถม (grade_band = 'primary', ป.4–6) เพิ่มจาก junior
-- senior ยังถูกกันเหมือนเดิม · แก้เฉพาะเงื่อนไข band + ข้อความ error ใน 2 ฟังก์ชัน
-- ฐาน: pg_get_functiondef จาก production 2026-10-03
--   guardian_claim_invite_code  md5 994f632e5d9ce44d1c12b0ec27501ecb
--   guardian_create_invite_code md5 ac25e760caabed04169838678ee8b7c7
-- CREATE OR REPLACE คง ACL เดิม (authenticated/service_role EXECUTE) และ SECURITY DEFINER / search_path เดิม

CREATE OR REPLACE FUNCTION public.guardian_create_invite_code()
 RETURNS TABLE(invite_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  -- 2026-10-03: เปิดให้ primary (ป.4–6) เพิ่มจาก junior · senior ยังไม่เปิด
  if coalesce((select p.grade_band from public.profiles p where p.id = v_uid), '') not in ('junior', 'primary') then
    raise exception 'ระบบผู้พิทักษ์ยังเปิดให้ ป.4–ม.3 ก่อน';
  end if;

  update public.guardian_links
  set status = 'revoked'
  where student_id = v_uid and status = 'pending';

  loop
    v_code := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 8)
    );
    exit when not exists (
      select 1 from public.guardian_links gl where gl.invite_code = v_code and gl.status = 'pending'
    );
  end loop;

  v_expires := now() + interval '24 hours';

  insert into public.guardian_links (student_id, invite_code, expires_at)
  values (v_uid, v_code, v_expires);

  return query select v_code, v_expires;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_claim_invite_code(p_invite_code text)
 RETURNS TABLE(student_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_link public.guardian_links;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'บัญชีนี้ไม่ใช่บัญชีผู้ปกครอง';
  end if;

  select * into v_link
  from public.guardian_links
  where invite_code = upper(btrim(p_invite_code))
    and status = 'pending'
  for update;

  if not found then
    raise exception 'รหัสเชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว';
  end if;

  if v_link.expires_at < now() then
    update public.guardian_links set status = 'expired' where id = v_link.id;
    raise exception 'รหัสเชิญหมดอายุแล้ว';
  end if;

  -- 2026-09-28: กันกรณีเด็กสร้างรหัสแล้วเปลี่ยนระดับชั้นก่อนผู้ปกครองกรอก
  -- 2026-10-03: เปิดให้ primary (ป.4–6) เพิ่มจาก junior · senior ยังไม่เปิด
  if coalesce((select p.grade_band from public.profiles p where p.id = v_link.student_id), '') not in ('junior', 'primary') then
    raise exception 'ระบบผู้พิทักษ์ยังเปิดให้ ป.4–ม.3 ก่อน';
  end if;

  if exists (
    select 1 from public.guardian_links gl2
    where gl2.guardian_id = v_uid and gl2.student_id = v_link.student_id and gl2.status = 'claimed'
  ) then
    raise exception 'ผู้ปกครองคนนี้เชื่อมกับบัญชีนี้อยู่แล้ว';
  end if;

  update public.guardian_links
  set status = 'claimed', guardian_id = v_uid, claimed_at = now()
  where id = v_link.id;

  return query select v_link.student_id;
end;
$function$;
