-- ปิดรอบท้าทายค้าง 3 รอบ (ปอนด์อนุมัติ Q1/Q1b 2026-11-01) และคืนกุญแจ
-- status='abandoned': ไม่นับเป็นรอบที่เล่นอยู่ และไม่นับเป็นรอบที่จบแล้ว/ชนะ · outcome คงเป็น null
-- ไม่ตั้ง raid_card_battles.finished_at: รอบค้างตัดสินจาก raid_runs.status และกันสถิติ progress ไม่ให้นับรอบนี้
do $migration$
declare
  v_targets constant uuid[] := array[
    '5c667e36-6734-4ae5-8484-210c0e001511',
    'e2ef85a2-a243-4bcc-a177-1a7b62ce2c0d',
    '0739a797-e1ff-4623-ad9f-56e8714e48d8'
  ]::uuid[];
  v_locked uuid[];
  v_tickets integer;
  v_runs integer;
begin
  select array_agg(id) into v_locked
  from (
    select id from public.raid_runs
    where id = any(v_targets) and status = 'in_progress' and gear_item_id is null
    for update
  ) t;

  if coalesce(array_length(v_locked, 1), 0) <> 3 then
    raise exception 'expected 3 stale runs, found %', coalesce(array_length(v_locked, 1), 0);
  end if;

  update public.raid_tickets
  set consumed_at = null, consumed_run_id = null
  where consumed_run_id = any(v_locked);
  get diagnostics v_tickets = row_count;

  if v_tickets <> 3 then
    raise exception 'expected 3 refunded tickets, updated %', v_tickets;
  end if;

  update public.raid_runs
  set status = 'abandoned', completed_at = now()
  where id = any(v_locked);
  get diagnostics v_runs = row_count;

  if v_runs <> 3 then
    raise exception 'expected 3 closed runs, updated %', v_runs;
  end if;
end
$migration$;
