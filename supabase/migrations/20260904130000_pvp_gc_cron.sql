-- Migration: 20260904130000_pvp_gc_cron
-- ตั้ง schedule ให้ pvp_gc() รันจริง — สไลซ์ 2 เขียน round_deadline + pvp_gc_round_timeouts()
-- ไว้แล้วแต่ไม่มีอะไรเรียก pvp_gc() ตามเวลา (cron.job มีแค่ adventure-return-push)
--
-- pattern: มิเรอร์ 20260829071334 (question-factory-worker) — ดึง bearer จาก cron job เดิม
-- ไม่ commit secret ลง git · ยิง route ผ่าน pg_net เหมือน cron อื่น
--
-- Interval: pg_cron 1.6.4 รองรับ sub-minute — ตั้ง '15 seconds' เพื่อให้ haste (30 วิ)
-- ถูกบังคับภายใน worst case ~45 วิ

begin;

set local lock_timeout = '5s';

do $$
declare
  v_secret text;
  v_job_id bigint;
begin
  select substring(command from 'Bearer ([0-9a-f]+)') into v_secret
  from cron.job
  where command like '%/api/cron/adventure-return%' and active
  order by jobid limit 1;
  if nullif(v_secret, '') is null then
    raise exception 'existing server cron credential not found';
  end if;

  select jobid into v_job_id from cron.job where jobname = 'pvp-gc';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  perform cron.schedule('pvp-gc', '15 seconds', pg_catalog.format(
    $job$select net.http_post(url := 'https://quizmon.xyz/api/cron/pvp-gc', headers := jsonb_build_object('Authorization', 'Bearer %s', 'Content-Type', 'application/json'), body := '{}'::jsonb);$job$,
    v_secret));
end $$;

commit;

-- Rollback:
-- select cron.unschedule((select jobid from cron.job where jobname = 'pvp-gc'));
