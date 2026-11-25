-- Warmup between an organization's own Gmail and Microsoft mailboxes: threads, messages, a job queue and the SQL that plans and scores it.
alter table public.mailboxes
  add column warmup_enabled boolean not null default false,
  add column warmup_started_at timestamptz,
  add column warmup_disabled_at timestamptz,
  add column warmup_start time not null default '09:00',
  add column warmup_end time not null default '17:30',
  add column warmup_filter_tag_enabled boolean not null default false,
  add column warmup_filter_tag text,
  add constraint mailboxes_warmup_provider_check check (not warmup_enabled or provider in ('google', 'microsoft')),
  add constraint mailboxes_warmup_window_check check (warmup_end > warmup_start),
  add constraint mailboxes_warmup_tag_check check (warmup_filter_tag is null or warmup_filter_tag ~ '^dm-[a-z2-7]{8}$');
create table public.warmup_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  library_key text not null,
  initiator_mailbox_id uuid not null,
  partner_mailbox_id uuid not null,
  turns_total integer not null check (turns_total between 1 and 10),
  turns_sent integer not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_turn_at timestamptz,
  unique (id, organization_id),
  check (initiator_mailbox_id <> partner_mailbox_id),
  foreign key (initiator_mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade,
  foreign key (partner_mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);
create index warmup_threads_initiator_idx on public.warmup_threads (initiator_mailbox_id, created_at desc);
create index warmup_threads_partner_idx on public.warmup_threads (partner_mailbox_id, created_at desc);
create table public.warmup_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null,
  turn integer not null check (turn >= 1),
  sender_mailbox_id uuid not null,
  recipient_mailbox_id uuid not null,
  rfc_message_id text,
  provider_message_id text,
  provider_thread_id text,
  recipient_provider_message_id text,
  recipient_provider_thread_id text,
  subject text not null,
  sent_at timestamptz not null default now(),
  placement text check (placement in ('inbox', 'spam', 'other', 'missing')),
  placement_checked_at timestamptz,
  check_attempts integer not null default 0,
  rescued boolean not null default false,
  unique (id, organization_id),
  unique (thread_id, turn),
  foreign key (thread_id, organization_id) references public.warmup_threads (id, organization_id) on delete cascade,
  foreign key (sender_mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade,
  foreign key (recipient_mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);
create index warmup_messages_sender_idx on public.warmup_messages (sender_mailbox_id, sent_at desc);
create index warmup_messages_sent_idx on public.warmup_messages (sent_at);
create table public.warmup_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mailbox_id uuid not null,
  kind text not null check (kind in ('start', 'check', 'reply')),
  thread_id uuid,
  message_id uuid,
  plan_day date,
  slot integer,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade,
  foreign key (thread_id, organization_id) references public.warmup_threads (id, organization_id) on delete cascade,
  foreign key (message_id, organization_id) references public.warmup_messages (id, organization_id) on delete cascade
);
create unique index warmup_jobs_plan_idx on public.warmup_jobs (mailbox_id, plan_day, slot) where kind = 'start';
create index warmup_jobs_due_idx on public.warmup_jobs (status, run_at);
create index warmup_jobs_message_idx on public.warmup_jobs (message_id) where message_id is not null;
-- Read-only for members; the planner and the executor write with the service role.
alter table public.warmup_threads enable row level security;
alter table public.warmup_messages enable row level security;
alter table public.warmup_jobs enable row level security;
create policy warmup_threads_select on public.warmup_threads for select to authenticated
  using (public.is_org_member(organization_id));
create policy warmup_messages_select on public.warmup_messages for select to authenticated
  using (public.is_org_member(organization_id));
create policy warmup_jobs_select on public.warmup_jobs for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.warmup_threads from anon, authenticated;
revoke insert, update, delete on public.warmup_messages from anon, authenticated;
revoke insert, update, delete on public.warmup_jobs from anon, authenticated;
grant all on public.warmup_threads to service_role;
grant all on public.warmup_messages to service_role;
grant all on public.warmup_jobs to service_role;
-- Leases due jobs by pushing run_at ten minutes out; the executor sets the real next state when it finishes.
create function public.claim_due_warmup_jobs(batch integer) returns setof public.warmup_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select j.id from public.warmup_jobs j
    where j.status = 'pending' and j.run_at <= now()
    order by j.run_at
    limit greatest(batch, 0)
    for update skip locked
  )
  update public.warmup_jobs j set run_at = now() + interval '10 minutes'
  from due where j.id = due.id
  returning j.*;
end;
$$;
revoke all on function public.claim_due_warmup_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_warmup_jobs(integer) to service_role;
-- Plans today's 'start' jobs per mailbox. Ramp: 10 a day, +1 a day, ceiling 40. About 60% of the day's volume starts threads, replies make up the rest.
-- Throttled mailboxes halve the target and hold the ramp where it was when the band changed; paused ones, weekends and lunch (12:00 to 13:00 local) get nothing.
-- Re-running is idempotent: a (mailbox, day, slot) triple is planned once.
create function public.plan_warmup_jobs(p_now timestamptz default now()) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  local_now timestamp;
  today date;
  ref timestamptz;
  days integer;
  target integer;
  n_start integer;
  lo timestamp;
  hi timestamp;
  t timestamp;
  added integer;
  total integer := 0;
begin
  update public.warmup_jobs set status = 'skipped', error = 'Plan day passed'
  where kind = 'start' and status = 'pending' and plan_day is not null and plan_day < (p_now at time zone 'UTC')::date - 1;
  for r in
    select m.id, m.organization_id, m.timezone, m.warmup_started_at, m.warmup_start, m.warmup_end,
      coalesce(h.band, 'healthy') as band, h.band_changed_at
    from public.mailboxes m
    left join public.mailbox_health h on h.mailbox_id = m.id
    where m.warmup_enabled and m.status = 'active' and m.provider in ('google', 'microsoft')
      and (
        select count(*) from public.mailboxes x
        where x.organization_id = m.organization_id and x.warmup_enabled and x.status = 'active' and x.provider in ('google', 'microsoft')
      ) >= 2
  loop
    begin
      local_now := p_now at time zone r.timezone;
      today := local_now::date;
      update public.warmup_jobs set status = 'skipped', error = 'Plan day passed'
      where mailbox_id = r.id and kind = 'start' and status = 'pending' and plan_day < today;
      continue when r.band = 'paused' or extract(dow from local_now) in (0, 6);
      ref := case when r.band = 'throttled' then least(p_now, coalesce(r.band_changed_at, p_now)) else p_now end;
      days := greatest(0, (ref at time zone r.timezone)::date - (coalesce(r.warmup_started_at, p_now) at time zone r.timezone)::date);
      target := least(40, 10 + days);
      if r.band = 'throttled' then
        target := greatest(1, target / 2);
      end if;
      n_start := round(target * 0.6)::integer;
      lo := greatest(local_now + interval '1 minute', today + r.warmup_start);
      hi := today + r.warmup_end;
      continue when lo >= hi;
      for slot_no in 1..n_start loop
        t := null;
        for tries in 1..20 loop
          t := lo + random() * (hi - lo);
          exit when not (t::time >= time '12:00' and t::time < time '13:00');
          t := null;
        end loop;
        continue when t is null;
        insert into public.warmup_jobs (organization_id, mailbox_id, kind, plan_day, slot, run_at)
        values (r.organization_id, r.id, 'start', today, slot_no, t at time zone r.timezone)
        on conflict do nothing;
        get diagnostics added = row_count;
        total := total + added;
      end loop;
    exception when others then
      continue;
    end;
  end loop;
  return total;
end;
$$;
revoke all on function public.plan_warmup_jobs(timestamptz) from public, anon, authenticated;
grant execute on function public.plan_warmup_jobs(timestamptz) to service_role;
-- Adds the spam placement input: spam_rate is spam over checked warmup placements in 7 days (null under 10 checks) and 30% or more is Watch.
create or replace function public.refresh_mailbox_health() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  ranks constant text[] := array['healthy', 'watch', 'throttled', 'paused'];
  cur_rank integer;
  target integer;
  new_rank integer;
  cur_band text;
  cur_changed timestamptz;
  had_row boolean;
  sent integer;
  bounces integer;
  complaints integer;
  denom numeric;
  b_rate numeric;
  c_rate numeric;
  dom_issue text;
  checked integer;
  spam integer;
  spam_ratio numeric;
  spam_issue text;
  trigger_reason text;
  new_reason text;
  n integer := 0;
begin
  -- Domains behind the mailboxes get a row so they can be checked and shown.
  insert into public.sending_domains (organization_id, domain, provider_hint)
  select distinct on (m.organization_id, lower(split_part(m.email, '@', 2)))
    m.organization_id, lower(split_part(m.email, '@', 2)),
    case m.provider when 'google' then 'google' when 'microsoft' then 'microsoft' when 'resend' then 'resend' else 'other' end
  from public.mailboxes m
  where lower(split_part(m.email, '@', 2)) ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    and char_length(split_part(m.email, '@', 2)) <= 253
  order by m.organization_id, lower(split_part(m.email, '@', 2)), m.created_at
  on conflict do nothing;
  for r in
    select m.id, m.organization_id, m.email
    from public.mailboxes m
    where exists (select 1 from public.mailbox_health h where h.mailbox_id = m.id)
      or exists (select 1 from public.messages x where x.mailbox_id = m.id and x.status = 'sent' and x.sent_at >= now() - interval '7 days')
      or exists (select 1 from public.delivery_events d where d.mailbox_id = m.id and d.occurred_at >= now() - interval '7 days')
      or exists (select 1 from public.warmup_messages w where w.sender_mailbox_id = m.id and w.sent_at >= now() - interval '7 days')
  loop
    select count(*) into sent from public.messages x
      where x.mailbox_id = r.id and x.organization_id = r.organization_id and x.status = 'sent' and x.sent_at >= now() - interval '7 days';
    select count(*) filter (where d.type = 'bounce'), count(*) filter (where d.type = 'complaint') into bounces, complaints
      from public.delivery_events d
      where d.mailbox_id = r.id and d.organization_id = r.organization_id and d.occurred_at >= now() - interval '7 days';
    select count(*) filter (where w.placement in ('inbox', 'spam', 'other')), count(*) filter (where w.placement = 'spam') into checked, spam
      from public.warmup_messages w
      where w.sender_mailbox_id = r.id and w.organization_id = r.organization_id and w.sent_at >= now() - interval '7 days';
    spam_ratio := case when checked >= 10 then round(spam::numeric / checked, 4) end;
    spam_issue := case when spam_ratio >= 0.3 then format('%s%% of checked warmup mail landed in spam over 7 days', round(spam_ratio * 100, 0)) end;
    denom := greatest(sent, 20);
    b_rate := round(bounces / denom, 4);
    c_rate := round(complaints / denom, 4);
    select case
        when s.spf_status in ('missing', 'fail') then 'SPF is ' || s.spf_status || ' for ' || s.domain
        when s.dmarc_status in ('missing', 'fail') then 'DMARC is ' || s.dmarc_status || ' for ' || s.domain
      end into dom_issue
      from public.sending_domains s
      where s.organization_id = r.organization_id and lower(s.domain) = lower(split_part(r.email, '@', 2));
    target := 0;
    trigger_reason := null;
    if b_rate >= 0.08 or c_rate >= 0.005 then
      target := 3;
    elsif b_rate >= 0.05 or c_rate >= 0.003 then
      target := 2;
    elsif b_rate >= 0.02 or c_rate >= 0.001 then
      target := 1;
    elsif dom_issue is not null or spam_issue is not null then
      target := 1;
    end if;
    if target > 0 and (b_rate >= 0.02 or c_rate >= 0.001) then
      trigger_reason := format('Bounce rate %s%%, complaint rate %s%% over 7 days', round(b_rate * 100, 1), round(c_rate * 100, 2));
    elsif target > 0 then
      trigger_reason := coalesce(dom_issue, spam_issue);
    end if;
    select h.band, h.band_changed_at into cur_band, cur_changed from public.mailbox_health h where h.mailbox_id = r.id;
    had_row := found;
    if not had_row then
      cur_band := 'healthy';
      cur_changed := now();
    end if;
    cur_rank := array_position(ranks, cur_band) - 1;
    if target >= cur_rank then
      new_rank := target;
    elsif now() - cur_changed >= interval '24 hours' then
      new_rank := cur_rank - 1;
    else
      new_rank := cur_rank;
    end if;
    if new_rank = target then
      new_reason := trigger_reason;
    else
      new_reason := 'Recovering: stepping down one band at a time, at least 24 hours apart';
    end if;
    if new_rank <> cur_rank then
      insert into public.mailbox_health_events (organization_id, mailbox_id, from_band, to_band, reason)
      values (r.organization_id, r.id, cur_band, ranks[new_rank + 1], new_reason);
    end if;
    insert into public.mailbox_health as h (mailbox_id, organization_id, band, sent_7d, bounces_7d, complaints_7d, bounce_rate, complaint_rate, spam_rate, reason, band_changed_at, updated_at)
    values (r.id, r.organization_id, ranks[new_rank + 1], sent, bounces, complaints, b_rate, c_rate, spam_ratio, new_reason, now(), now())
    on conflict (mailbox_id) do update set
      band = excluded.band,
      sent_7d = excluded.sent_7d,
      bounces_7d = excluded.bounces_7d,
      complaints_7d = excluded.complaints_7d,
      bounce_rate = excluded.bounce_rate,
      complaint_rate = excluded.complaint_rate,
      spam_rate = excluded.spam_rate,
      reason = excluded.reason,
      band_changed_at = case when h.band <> excluded.band then now() else h.band_changed_at end,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.refresh_mailbox_health() from public, anon, authenticated;
grant execute on function public.refresh_mailbox_health() to service_role;

create or replace function public.purge_old_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  total integer := 0;
begin
  delete from public.tracking_events where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  total := total + n;
  delete from public.warmup_jobs where status in ('done', 'skipped') and created_at < now() - interval '14 days';
  get diagnostics n = row_count;
  total := total + n;
  delete from public.warmup_messages where sent_at < now() - interval '90 days';
  get diagnostics n = row_count;
  total := total + n;
  return total;
end;
$$;
