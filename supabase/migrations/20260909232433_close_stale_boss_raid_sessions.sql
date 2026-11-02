-- Auto-close boss raid rooms ที่ถูกทิ้งค้าง (ครูปิดจอกลางคัน / เปิดห้องแล้วไม่ได้เล่น)
-- ไม่แจกรางวัล: result และ reward_distributed_at ปล่อย null (= abandoned) ตาม pattern ที่ปิดมือไว้ก่อนหน้า
create or replace function public.close_stale_boss_raid_sessions(p_idle_minutes int default 120)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with stale as (
    select
      s.id,
      greatest(
        coalesce(
          (select max(a.answered_at) from boss_raid_answers a where a.session_id = s.id),
          s.started_at,
          s.created_at
        ),
        coalesce(
          (select max(p.joined_at) from boss_raid_participants p where p.session_id = s.id),
          s.created_at
        )
      ) as last_activity
    from boss_raid_sessions s
    where s.status in ('lobby', 'in_progress')
  )
  update boss_raid_sessions t
  set status = 'ended',
      ended_at = stale.last_activity
  from stale
  where t.id = stale.id
    and stale.last_activity < now() - make_interval(mins => p_idle_minutes);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_stale_boss_raid_sessions(int) from public, anon, authenticated;