-- Trip reminder texts (24 hours and 2 hours before departure).
-- Every 10 minutes pg_cron POSTs to the app's /api/cron/reminders, which asks
-- due_trip_reminders() (migration 018) what's due and texts it.
--
-- The bearer token lives in Supabase Vault as "cron_secret" and must equal the
-- app's CRON_SECRET env var. Create it once (not stored in this file):
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');

create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'trip-reminders';
select cron.schedule(
  'trip-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://volt-transportation.com/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
