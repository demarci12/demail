-- Run once in the Supabase SQL editor after the first deploy. Not a migration: it holds your URL and secret.
-- 1. Replace the two placeholders below.
-- 2. Run the whole file. Re-running replaces the job and the stored secrets.
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
select cron.schedule('demail-health', '*/5 * * * *', $job$ select public.refresh_mailbox_health(); $job$);
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
