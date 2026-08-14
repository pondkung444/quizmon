-- ============================================================
-- REVISION (หลังเฟส 6): เปิดสเตตัส 5 ค่าของ Qmon ที่ภูมิใจให้คนทั่วไปเห็นบน S04 ด้วย — ตัดสินใจใหม่
-- ของปอนด์ พลิกกฎเดิมใน §5.3 ที่เคยล็อกว่าสเตตัสเป็นของเพื่อนเท่านั้น (ไม่ใช่บั๊ก) ยังไม่เปิดอุปกรณ์ที่สวม/
-- โรงเรียน/ระดับชั้น/เส้นทางของฉัน/Qmon ตัวโปรด/Friend Code ให้คนทั่วไป — คงเป็น friends-only เหมือนเดิม
-- เปลี่ยน return type (เพิ่มคอลัมน์ stat_*) ต้อง DROP ก่อน CREATE เพราะ Postgres ไม่ให้ REPLACE
-- เปลี่ยนโครง OUT parameters ตรงๆ
-- ============================================================
drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(p_target_user_id uuid)
returns table(
  found boolean,
  relationship_status text,
  target_user_id uuid,
  username text,
  pet_nickname text,
  pet_stage int,
  pet_subline text,
  pet_personality text,
  egg_sprite_prefix text,
  egg_name_th text,
  stat_hp int,
  stat_atk int,
  stat_def int,
  stat_spd int,
  stat_foc int,
  medals jsonb,
  like_count int,
  liked_by_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_pride_pet_id uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text,
      null::int, null::int, null::int, null::int, null::int, null::jsonb, null::int, null::boolean;
    return;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_target_user_id) or (blocker_id = p_target_user_id and blocked_id = v_me)
  ) then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text,
      null::int, null::int, null::int, null::int, null::int, null::jsonb, null::int, null::boolean;
    return;
  end if;

  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = p_target_user_id;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = p_target_user_id and p.is_active = true limit 1;
  end if;

  return query
  select
    true,
    public._compute_relationship_status(v_me, p_target_user_id),
    p_target_user_id,
    pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    pt.stat_hp, pt.stat_atk, pt.stat_def, pt.stat_spd, pt.stat_foc,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'tier', ad.tier, 'imageFile', ad.image_file) order by upa.pin_order)
      from public.user_pinned_achievements upa
      join public.achievement_definitions ad on ad.id = upa.achievement_id
      where upa.user_id = p_target_user_id
    ), '[]'::jsonb),
    (select count(*)::int from public.profile_likes where profile_user_id = p_target_user_id),
    exists (select 1 from public.profile_likes where liker_id = v_me and profile_user_id = p_target_user_id)
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  where pr.id = p_target_user_id;
end;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;
