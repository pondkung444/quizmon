select cron.unschedule('pvp-gc');
select cron.schedule(
  'pvp-gc',
  '* * * * *',
  $$select net.http_post(url := 'https://quizmon.xyz/api/cron/pvp-gc', headers := jsonb_build_object('Authorization', 'Bearer d39d66456be26af281d574ceebea5e1be69376a072ed96c37c793087e352143c', 'Content-Type', 'application/json'), body := '{}'::jsonb);$$
);
