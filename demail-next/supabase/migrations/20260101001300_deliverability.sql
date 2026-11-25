-- Deliverability: bounce and complaint events, per-mailbox health bands, sending domains and the SQL that scores them.
create table public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mailbox_id uuid,
  message_id uuid,
  contact_id uuid,
  campaign_id uuid,
  type text not null check (type in ('bounce', 'complaint')),
  source text not null check (source in ('sync', 'resend')),
  detail text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete set null (mailbox_id),
  foreign key (message_id, organization_id) references public.messages (id, organization_id) on delete set null (message_id),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete set null (campaign_id)
);
create unique index delivery_events_message_type_idx on public.delivery_events (message_id, type) where message_id is not null;
create index delivery_events_mailbox_idx on public.delivery_events (mailbox_id, occurred_at);
alter table public.delivery_events enable row level security;
create policy delivery_events_select on public.delivery_events for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.delivery_events from anon, authenticated;
grant all on public.delivery_events to service_role;
-- One row per mailbox, written only by refresh_mailbox_health(). Rates are fractions (0.03 is 3%).
create table public.mailbox_health (
  mailbox_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  band text not null default 'healthy' check (band in ('healthy', 'watch', 'throttled', 'paused')),
  sent_7d integer not null default 0,
  bounces_7d integer not null default 0,
  complaints_7d integer not null default 0,
  bounce_rate numeric not null default 0,
  complaint_rate numeric not null default 0,
  spam_rate numeric,
  reason text,
  band_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);
create trigger mailbox_health_org_immutable before update on public.mailbox_health
  for each row execute function public.prevent_org_change();
alter table public.mailbox_health enable row level security;
create policy mailbox_health_select on public.mailbox_health for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.mailbox_health from anon, authenticated;
grant all on public.mailbox_health to service_role;
create table public.mailbox_health_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mailbox_id uuid not null,
  from_band text not null check (from_band in ('healthy', 'watch', 'throttled', 'paused')),
  to_band text not null check (to_band in ('healthy', 'watch', 'throttled', 'paused')),
  reason text,
  created_at timestamptz not null default now(),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);
create index mailbox_health_events_mailbox_idx on public.mailbox_health_events (mailbox_id, created_at desc);
alter table public.mailbox_health_events enable row level security;
create policy mailbox_health_events_select on public.mailbox_health_events for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.mailbox_health_events from anon, authenticated;
grant all on public.mailbox_health_events to service_role;
create table public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain text not null check (
    char_length(domain) <= 253
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  provider_hint text not null default 'other' check (provider_hint in ('google', 'microsoft', 'resend', 'other')),
  dkim_selector text check (dkim_selector is null or dkim_selector ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  spf_status text not null default 'unknown' check (spf_status in ('pass', 'missing', 'fail', 'unknown')),
  dkim_status text not null default 'unknown' check (dkim_status in ('pass', 'missing', 'fail', 'unknown')),
  dmarc_status text not null default 'unknown' check (dmarc_status in ('pass', 'missing', 'fail', 'unknown')),
  spf_record text,
  dmarc_record text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index sending_domains_org_domain_idx on public.sending_domains (organization_id, lower(domain));
create index sending_domains_checked_idx on public.sending_domains (last_checked_at);
create trigger sending_domains_org_immutable before update on public.sending_domains
  for each row execute function public.prevent_org_change();
alter table public.sending_domains enable row level security;
create policy sending_domains_select on public.sending_domains for select to authenticated
  using (public.is_org_member(organization_id));
create policy sending_domains_insert on public.sending_domains for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy sending_domains_update on public.sending_domains for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy sending_domains_delete on public.sending_domains for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
grant all on public.sending_domains to service_role;
-- Recomputes health over a 7 day window. The rate denominator is max(sent, 20) so a new mailbox with a few bounces still trips.
-- Bands: watch at bounce 2% or complaint 0.1% (or SPF/DMARC missing), throttled at 5% or 0.3%, paused at 8% or 0.5%.
-- A worse band applies at once; a better one is reached one band at a time and only after 24 hours in the current band.
create function public.refresh_mailbox_health() returns integer
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
  loop
    select count(*) into sent from public.messages x
      where x.mailbox_id = r.id and x.organization_id = r.organization_id and x.status = 'sent' and x.sent_at >= now() - interval '7 days';
    select count(*) filter (where d.type = 'bounce'), count(*) filter (where d.type = 'complaint') into bounces, complaints
      from public.delivery_events d
      where d.mailbox_id = r.id and d.organization_id = r.organization_id and d.occurred_at >= now() - interval '7 days';
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
    elsif dom_issue is not null then
      target := 1;
    end if;
    if target > 0 and (b_rate >= 0.02 or c_rate >= 0.001) then
      trigger_reason := format('Bounce rate %s%%, complaint rate %s%% over 7 days', round(b_rate * 100, 1), round(c_rate * 100, 2));
    elsif target > 0 then
      trigger_reason := dom_issue;
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
    insert into public.mailbox_health as h (mailbox_id, organization_id, band, sent_7d, bounces_7d, complaints_7d, bounce_rate, complaint_rate, reason, band_changed_at, updated_at)
    values (r.id, r.organization_id, ranks[new_rank + 1], sent, bounces, complaints, b_rate, c_rate, new_reason, now(), now())
    on conflict (mailbox_id) do update set
      band = excluded.band,
      sent_7d = excluded.sent_7d,
      bounces_7d = excluded.bounces_7d,
      complaints_7d = excluded.complaints_7d,
      bounce_rate = excluded.bounce_rate,
      complaint_rate = excluded.complaint_rate,
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
