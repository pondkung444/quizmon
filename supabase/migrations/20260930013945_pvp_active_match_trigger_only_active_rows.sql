-- trigger กันแมตช์ซ้อนคู่: เช็คเฉพาะแถวที่ insert เป็น 'active' (แถว finished/abandoned ไม่ควรถูกบล็อก)
begin;

create or replace function public._pvp_block_repeat_active_match()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'active' then return new; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(new.player_a_id, new.player_b_id)::text || greatest(new.player_a_id, new.player_b_id)::text, 0));
  if public._pvp_active_match_between(new.player_a_id, new.player_b_id) is not null then
    raise exception 'คุณกำลังประลองกับคนนี้อยู่ — เล่นแมตช์เดิมให้จบก่อนถึงจะท้าใหม่ได้';
  end if;
  return new;
end;
$$;

commit;
