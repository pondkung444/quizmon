select cron.unschedule('pvp-gc');
select cron.schedule(
  'pvp-gc',
  '45 seconds',
  $$select net.http_post(url := 'https://quizmon.xyz/api/cron/pvp-gc', headers := jsonb_build_object('Authorization', 'Bearer <REDACTED — rotated 2026-09-25, now read from Vault secret cron_secret (see 20260925220000)>', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$
);
