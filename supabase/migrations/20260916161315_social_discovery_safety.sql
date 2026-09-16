-- Counters live outside the Data API and contain no search terms.
create schema if not exists social_private;
revoke all on schema social_private from public, anon, authenticated;
create table social_private.action_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('name_search', 'code_search', 'friend_request')),
  started_at timestamptz not null,
  used integer not null check (used > 0),
  primary key (user_id, action)
);
alter table social_private.action_windows enable row level security;
revoke all on social_private.action_windows from public, anon, authenticated;

-- Atomic, bounded to three rows per account; no caller-supplied identity/limit.
create function social_private.consume_action(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_limit integer;
  v_used integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  v_limit := case p_action when 'name_search' then 20 when 'code_search' then 60 when 'friend_request' then 10 end;
  if v_limit is null then raise exception 'Invalid social action'; end if;
  insert into social_private.action_windows as w(user_id, action, started_at, used)
  values (v_me, p_action, v_now, 1)
  on conflict (user_id, action) do update
    set started_at = case when w.started_at <= v_now - interval '1 minute' then v_now else w.started_at end,
        used = case when w.started_at <= v_now - interval '1 minute' then 1 else w.used + 1 end
    where w.started_at <= v_now - interval '1 minute' or w.used < v_limit
  returning used into v_used;
  if v_used is null then raise exception 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้งนะ'; end if;
end;
$$;
revoke all on function social_private.consume_action(text) from public, anon, authenticated;

-- Keep established block/request logic intact and guard the direct RPC too.
-- Abort instead of silently accepting a changed upstream function definition.
do $$
declare
  v_signature text;
  v_action text;
  v_definition text;
  v_anchor text := '  perform public._expire_stale_friend_requests(v_me);';
begin
  for v_signature, v_action in
    select * from (values ('public.search_friend_code(text)', 'code_search'), ('public.send_friend_request(uuid)', 'friend_request')) as guards(signature, action)
  loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if strpos(v_definition, v_anchor) = 0 or strpos(v_definition, 'social_private.consume_action') > 0 then
      raise exception 'Unexpected definition for %', v_signature;
    end if;
    v_definition := replace(v_definition, v_anchor,
      format('  perform social_private.consume_action(%L);', v_action) || chr(10) || v_anchor);
    execute v_definition;
  end loop;
end;
$$;
revoke execute on function public.search_friend_code(text) from public, anon;
revoke execute on function public.send_friend_request(uuid) from public, anon;
grant execute on function public.search_friend_code(text), public.send_friend_request(uuid) to authenticated;

-- Exact-name search: privacy-safe preview only, filtered before LIMIT for blocks.
-- SECURITY DEFINER is required because profile-directory access is not granted.
create index profiles_friend_name_lookup_idx on public.profiles(lower(username), id)
  where friend_code is not null;
create function public.search_friend_name(p_name text)
returns table(found boolean, relationship_status text, target_user_id uuid, username text,
  pet_nickname text, pet_stage int, pet_subline text, pet_personality text,
  egg_sprite_prefix text, egg_name_th text)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(p_name);
  v_code text;
begin
  if v_me is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if v_name is null or char_length(v_name) not between 2 and 40 or v_name ~ '[[:cntrl:]]' then
    raise exception 'กรอกชื่อเล่น 2–40 ตัวอักษร';
  end if;
  perform social_private.consume_action('name_search');
  for v_code in
    select pr.friend_code from public.profiles pr
    where lower(pr.username) = lower(v_name) and pr.id <> v_me and pr.friend_code is not null
      and not exists (select 1 from public.blocks b
        where (b.blocker_id = v_me and b.blocked_id = pr.id) or (b.blocker_id = pr.id and b.blocked_id = v_me))
    order by pr.id limit 10
  loop
    return query select r.* from public.search_friend_code(v_code) r where r.found;
  end loop;
end;
$$;
revoke execute on function public.search_friend_name(text) from public, anon;
grant execute on function public.search_friend_name(text) to authenticated;
