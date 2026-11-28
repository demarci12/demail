-- Scheduler heartbeats: each /api/cron/* route records one row per job so the setup health page can tell a stalled scheduler from a quiet one.
create table public.cron_heartbeats (
  job text primary key check (job ~ '^[a-z0-9-]{1,30}$'),
  last_run_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_ok boolean not null default true,
  last_ms integer check (last_ms >= 0),
  runs bigint not null default 0
);
-- Instance-wide, not workspace data: RLS on with no policy, so only the service role reads or writes it.
alter table public.cron_heartbeats enable row level security;

create function public.record_cron_heartbeat(p_job text, p_ok boolean, p_ms integer) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.cron_heartbeats (job, last_run_at, last_ok_at, last_ok, last_ms, runs)
  values (p_job, now(), case when p_ok then now() end, p_ok, greatest(p_ms, 0), 1)
  on conflict (job) do update set
    last_run_at = now(),
    last_ok_at = case when p_ok then now() else public.cron_heartbeats.last_ok_at end,
    last_ok = p_ok,
    last_ms = greatest(p_ms, 0),
    runs = public.cron_heartbeats.runs + 1;
$$;
revoke all on function public.record_cron_heartbeat(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.record_cron_heartbeat(text, boolean, integer) to service_role;
