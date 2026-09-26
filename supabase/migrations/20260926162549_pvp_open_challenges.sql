-- Public PvP board. Direct friend challenges keep their existing behavior.
begin;

alter table public.pvp_challenges alter column opponent_id drop not null;
alter table public.pvp_challenges
  add column visibility text not null default 'direct'
    check (visibility in ('direct', 'open')),
  add constraint pvp_challenge_recipient_check
    check (visibility = 'open' or opponent_id is not null);

create unique index pvp_one_pending_open_challenge
  on public.pvp_challenges (challenger_id)
  where visibility = 'open' and status = 'pending';
create index pvp_open_board_idx on public.pvp_challenges (created_at desc)
  where visibility = 'open' and status = 'pending';

create or replace function public.create_open_pvp_challenge(p_pet_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_band text;
begin
  if v_uid is null or exists (select 1 from auth.users where id = v_uid and is_anonymous) then
    raise exception 'ต้องผูกบัญชีก่อนประลอง';
  end if;
  select grade_band into v_band from public.profiles where id = v_uid;
  if v_band not in ('junior', 'senior') or v_band is null then
    raise exception 'ต้องเลือกระดับชั้นก่อนเปิดคำท้า';
  end if;
  if not exists (select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4) then
    raise exception 'เลือก Qmon ระยะ 4 ของคุณ';
  end if;
  update public.pvp_challenges set status = 'expired', responded_at = now()
    where challenger_id = v_uid and visibility = 'open' and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.pvp_challenges where challenger_id = v_uid
      and visibility = 'open' and status = 'pending') then
    raise exception 'คุณมีคำท้าเปิดค้างอยู่แล้ว';
  end if;
  perform public._pvp_grant_tickets(v_uid);
  insert into public.pvp_challenges (challenger_id, opponent_id, challenger_pet_id, visibility)
    values (v_uid, null, p_pet_id, 'open') returning id into v_id;
  update public.pvp_tickets set consumed_at = now(), consumed_challenge_id = v_id
    where id = (select id from public.pvp_tickets where user_id = v_uid and consumed_at is null
      order by granted_at limit 1 for update skip locked);
  if not found then raise exception 'ตั๋วประลองหมด'; end if;
  return v_id;
end;
$$;

create or replace function public.list_open_pvp_challenges()
returns table (id uuid, pet_name text, pet_stage smallint, pet_subline text,
  pet_personality text, egg_sprite_prefix text, egg_name_th text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, p.nickname, p.stage, p.subline::text, p.personality::text,
    e.sprite_prefix, e.name_th, c.expires_at
  from public.pvp_challenges c
  join public.profiles owner_profile on owner_profile.id = c.challenger_id
  join public.profiles viewer on viewer.id = auth.uid()
  join public.pets p on p.id = c.challenger_pet_id and p.user_id = c.challenger_id and p.stage = 4
  join public.egg_types e on e.id = p.egg_type_id
  where c.visibility = 'open' and c.status = 'pending' and c.expires_at > now()
    and c.challenger_id <> auth.uid()
    and owner_profile.grade_band = viewer.grade_band
    and viewer.grade_band in ('junior', 'senior')
    and not exists (select 1 from public.blocks b where
      (b.blocker_id = c.challenger_id and b.blocked_id = auth.uid()) or
      (b.blocker_id = auth.uid() and b.blocked_id = c.challenger_id))
  order by c.created_at desc limit 50;
$$;

create or replace function public.accept_open_pvp_challenge(p_challenge_id uuid, p_pet_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ch public.pvp_challenges;
  v_band text;
  v_match_id uuid;
begin
  if v_uid is null or exists (select 1 from auth.users where id = v_uid and is_anonymous) then
    raise exception 'ต้องผูกบัญชีก่อนประลอง';
  end if;
  select * into v_ch from public.pvp_challenges where id = p_challenge_id for update;
  if not found or v_ch.visibility <> 'open' or v_ch.status <> 'pending' or v_ch.expires_at <= now() then
    raise exception 'คำท้านี้ไม่มีให้รับแล้ว';
  end if;
  if v_ch.challenger_id = v_uid then raise exception 'รับคำท้าของตัวเองไม่ได้'; end if;
  select grade_band into v_band from public.profiles where id = v_uid;
  if v_band is null or v_band not in ('junior', 'senior') or
    v_band is distinct from (select grade_band from public.profiles where id = v_ch.challenger_id) then
    raise exception 'รับคำท้าได้เฉพาะระดับชั้นเดียวกัน';
  end if;
  if exists (select 1 from public.blocks b where
      (b.blocker_id = v_uid and b.blocked_id = v_ch.challenger_id) or
      (b.blocker_id = v_ch.challenger_id and b.blocked_id = v_uid)) then
    raise exception 'รับคำท้านี้ไม่ได้';
  end if;
  if not exists (select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4) then
    raise exception 'เลือก Qmon ระยะ 4 ของคุณ';
  end if;
  perform public._pvp_grant_tickets(v_uid);
  if not exists (select 1 from public.pvp_tickets where user_id = v_uid and consumed_at is null) then
    raise exception 'ตั๋วประลองหมด';
  end if;
  update public.pvp_challenges set opponent_id = v_uid where id = p_challenge_id;
  v_match_id := public.accept_pvp_challenge(p_challenge_id, p_pet_id);
  update public.pvp_tickets set consumed_at = now(), consumed_challenge_id = p_challenge_id
    where id = (select id from public.pvp_tickets where user_id = v_uid and consumed_at is null
      order by granted_at limit 1 for update skip locked);
  if not found then raise exception 'ตั๋วประลองหมด'; end if;
  return v_match_id;
end;
$$;

revoke all on function public.create_open_pvp_challenge(uuid) from public, anon;
revoke all on function public.list_open_pvp_challenges() from public, anon;
revoke all on function public.accept_open_pvp_challenge(uuid, uuid) from public, anon;
grant execute on function public.create_open_pvp_challenge(uuid) to authenticated;
grant execute on function public.list_open_pvp_challenges() to authenticated;
grant execute on function public.accept_open_pvp_challenge(uuid, uuid) to authenticated;

commit;
