-- guardian_ensure_account: เปิดบัญชีผู้ปกครอง (แถว public.guardians) ให้ผู้ใช้ที่ล็อกอินอยู่
--
-- ทำไมต้องมี: handle_new_user() สร้างแถว guardians ได้เฉพาะตอน signUp ด้วย email/password ที่ส่ง
-- raw_user_meta_data.account_type = 'guardian' เท่านั้น — Google OAuth ตั้ง metadata ไม่ได้ ผู้ปกครองที่
-- เข้าด้วย Google จึงได้แค่โปรไฟล์นักเรียนเปล่าๆ แล้วติดหน้า "ยังไม่ได้ตั้งค่าเป็นบัญชีผู้ปกครอง"
-- ฟังก์ชันนี้ idempotent (มีแถวอยู่แล้ว = ไม่ทำอะไร) และ "ไม่" เปิดสิทธิ์ใช้ฟีเจอร์ — allowlist
-- (guardian_admin) ยังเป็นด่านแยกที่ is_guardian_admin() เช็คใน RPC ทุกตัวเหมือนเดิม
create or replace function public.guardian_ensure_account(p_display_name text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  -- บัญชี guest (anonymous sign-in) สมัครเป็นผู้ปกครองไม่ได้
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'บัญชีผู้เยี่ยมชมไม่สามารถเป็นบัญชีผู้ปกครองได้';
  end if;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null then
    select nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
      into v_name
    from auth.users u
    where u.id = v_uid;
  end if;

  insert into public.guardians (id, display_name)
  values (v_uid, left(v_name, 60))
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.guardian_ensure_account(text) from public, anon;
grant execute on function public.guardian_ensure_account(text) to authenticated, service_role;
