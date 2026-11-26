-- Run once in the Supabase SQL editor after the first deploy. Not a migration: it holds your URL and secret.
-- 1. Replace the two placeholders below.
-- 2. Run the whole file. Re-running replaces the jobs and the stored secrets.
-- Jobs: demail-send, demail-sync, demail-warmup and demail-ai (every minute, HTTP), demail-domains (hourly, HTTP),
-- demail-health (every 5 minutes, SQL: health bands and warmup planning) and demail-purge (daily 03:17, SQL).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  delete from vault.secrets where name in ('demail_app_url', 'demail_cron_secret');
  -- Public URL of your Vercel deployment, no trailing slash.
  perform vault.create_secret('https://YOUR-APP.vercel.app', 'demail_app_url');
  -- Must equal the CRON_SECRET environment variable on Vercel.
  perform vault.create_secret('REPLACE-WITH-CRON_SECRET', 'demail_cron_secret');
end
$$;

select cron.unschedule('demail-send') where exists (select 1 from cron.job where jobname = 'demail-send');

select cron.schedule(
  'demail-send',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'demail_app_url') || '/api/cron/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demail_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
select cron.unschedule('demail-sync') where exists (select 1 from cron.job where jobname = 'demail-sync');
select cron.schedule(
  'demail-sync',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'demail_app_url') || '/api/cron/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demail_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
select cron.unschedule('demail-health') where exists (select 1 from cron.job where jobname = 'demail-health');
select cron.schedule('demail-health', '*/5 * * * *', $job$ select public.refresh_mailbox_health(); select public.plan_warmup_jobs(); $job$);
select cron.unschedule('demail-domains') where exists (select 1 from cron.job where jobname = 'demail-domains');
select cron.schedule(
  'demail-domains',
  '7 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'demail_app_url') || '/api/cron/domains',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demail_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
select cron.unschedule('demail-warmup') where exists (select 1 from cron.job where jobname = 'demail-warmup');
select cron.schedule(
  'demail-warmup',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'demail_app_url') || '/api/cron/warmup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demail_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
select cron.unschedule('demail-ai') where exists (select 1 from cron.job where jobname = 'demail-ai');
select cron.schedule(
  'demail-ai',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'demail_app_url') || '/api/cron/ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demail_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
select cron.unschedule('demail-purge') where exists (select 1 from cron.job where jobname = 'demail-purge');
select cron.schedule('demail-purge', '17 3 * * *', $job$ select public.purge_old_events(); $job$);
