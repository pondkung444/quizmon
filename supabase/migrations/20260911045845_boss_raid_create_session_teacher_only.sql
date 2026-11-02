CREATE OR REPLACE FUNCTION public.create_boss_raid_session(p_config jsonb DEFAULT '{}'::jsonb)
 RETURNS boss_raid_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.boss_raid_sessions;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  -- จำกัดสิทธิ์สร้างห้องเฉพาะครูปอนด์ (panuwat.pond@gmail.com)
  if v_user_id <> '792b8e1d-410c-4158-9c62-32b437b05121'::uuid then
    raise exception 'เฉพาะครูเท่านั้นที่สร้างห้องได้';
  end if;

  insert into public.boss_raid_sessions (teacher_id, join_code, config)
  values (v_user_id, public.gen_boss_raid_join_code(), coalesce(p_config, '{}'::jsonb))
  returning * into v_session;
  return v_session;
end;
$function$
