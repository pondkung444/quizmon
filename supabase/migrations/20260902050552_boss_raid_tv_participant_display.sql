begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.get_boss_raid_participant_names(uuid);

create or replace function public.get_boss_raid_participant_display(p_session_id uuid)
returns table (
  participant_id uuid,
  display_name   text,
  sprite_prefix  text,
  stage          smallint,
  subline        text,
  personality    text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id,
         coalesce(pt.nickname, 'Qmon ของ ' || prof.username),
         et.sprite_prefix,
         pt.stage,
         pt.subline,
         pt.personality
  from public.boss_raid_participants p
  join public.pets pt on pt.id = p.pet_id
  join public.egg_types et on et.id = pt.egg_type_id
  join public.profiles prof on prof.id = p.user_id
  where p.session_id = p_session_id
    and public.is_boss_raid_member(p_session_id);
$$;

comment on function public.get_boss_raid_participant_display(uuid) is
  'ข้อมูลแสดงผลผู้เล่นในห้อง (TV top-5 formation / ticker / มือถือ): display_name '
  '(coalesce(pets.nickname, "Qmon ของ " || profiles.username)) + 4 ช่องประกอบ sprite path '
  '(sprite_prefix/stage/subline/personality — client resolve ผ่าน src/lib/petImage.ts เอง). '
  'เข้าถึงได้เฉพาะ member ของห้องนั้น (ครู/นักเรียนในห้อง) ไม่ expose column อื่นของ pets/egg_types/profiles.';

grant execute on function public.get_boss_raid_participant_display(uuid) to authenticated;

commit;