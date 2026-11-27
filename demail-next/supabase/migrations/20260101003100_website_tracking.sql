-- Website tracking. Public page views are written only by record_site_view, inside the tracker's own organization; no IP address or user agent is stored.
create table public.site_trackers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  public_key text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 24) check (public_key ~ '^[0-9a-f]{24}$'),
  domains text[] not null check (
    cardinality(domains) between 1 and 10
    and array_to_string(domains, ' ') ~ '^[a-z0-9.-]{1,253}( [a-z0-9.-]{1,253})*$'
  ),
  consent_mode text not null default 'ask' check (consent_mode in ('ask', 'record')),
  identify_from_email boolean not null default true,
  enabled boolean not null default true,
  retention_days integer not null default 90 check (retention_days between 1 and 365),
  daily_limit integer not null default 1000 check (daily_limit between 1 and 50000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index site_trackers_org_idx on public.site_trackers (organization_id);
create trigger site_trackers_updated_at before update on public.site_trackers
  for each row execute function public.set_updated_at();
create trigger site_trackers_org_immutable before update on public.site_trackers
  for each row execute function public.prevent_org_change();
alter table public.site_trackers enable row level security;
create policy site_trackers_select on public.site_trackers for select to authenticated
  using (public.is_org_member(organization_id));
create policy site_trackers_insert on public.site_trackers for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy site_trackers_update on public.site_trackers for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy site_trackers_delete on public.site_trackers for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.site_trackers from anon;
grant select, insert, update, delete on public.site_trackers to authenticated;
grant all on public.site_trackers to service_role;

-- A visitor is a random id from the site's own localStorage, linked to a contact only through a signed email click.
create table public.site_visitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tracker_id uuid not null,
  visitor_key uuid not null,
  contact_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tracker_id, visitor_key),
  unique (id, organization_id),
  foreign key (tracker_id, organization_id) references public.site_trackers (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);
create index site_visitors_contact_idx on public.site_visitors (contact_id);
create index site_visitors_tracker_seen_idx on public.site_visitors (tracker_id, last_seen_at);
create trigger site_visitors_org_immutable before update on public.site_visitors
  for each row execute function public.prevent_org_change();
alter table public.site_visitors enable row level security;
create policy site_visitors_select on public.site_visitors for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.site_visitors from anon;
revoke insert, update, delete on public.site_visitors from authenticated;
grant all on public.site_visitors to service_role;

create table public.site_page_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tracker_id uuid not null,
  visitor_id uuid not null,
  host text not null check (host ~ '^[a-z0-9.-]{1,253}$'),
  path text not null check (char_length(path) between 1 and 300 and left(path, 1) = '/'),
  referrer_host text check (referrer_host is null or referrer_host ~ '^[a-z0-9.-]{1,253}$'),
  created_at timestamptz not null default now(),
  foreign key (tracker_id, organization_id) references public.site_trackers (id, organization_id) on delete cascade,
  foreign key (visitor_id, organization_id) references public.site_visitors (id, organization_id) on delete cascade
);
create index site_page_views_tracker_idx on public.site_page_views (tracker_id, created_at);
create index site_page_views_visitor_idx on public.site_page_views (visitor_id, created_at desc);
create index site_page_views_org_idx on public.site_page_views (organization_id, created_at desc);
create index site_page_views_created_idx on public.site_page_views (created_at);
alter table public.site_page_views enable row level security;
create policy site_page_views_select on public.site_page_views for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.site_page_views from anon;
revoke insert, update, delete on public.site_page_views from authenticated;
grant all on public.site_page_views to service_role;

-- Hourly view counters keyed by an HMAC of tracker key, address prefix and day; no IP address is stored.
create table public.site_rate_buckets (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tracker_id uuid not null,
  bucket text not null check (char_length(bucket) between 1 and 100),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (tracker_id, bucket, window_start),
  foreign key (tracker_id, organization_id) references public.site_trackers (id, organization_id) on delete cascade
);
alter table public.site_rate_buckets enable row level security;
revoke all on public.site_rate_buckets from anon, authenticated;
grant all on public.site_rate_buckets to service_role;

-- Records one public page view; the organization always comes from the tracker row.
create function public.record_site_view(
  p_key text,
  p_bucket text,
  p_visitor uuid,
  p_host text,
  p_path text,
  p_referrer text,
  p_consented boolean,
  p_message uuid default null
) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tracker public.site_trackers%rowtype;
  v_hits integer;
  v_today integer;
  v_visitor uuid;
  v_contact uuid;
begin
  select * into v_tracker from public.site_trackers where public_key = p_key;
  if not found then
    return 'unknown';
  end if;
  if not v_tracker.enabled then
    return 'disabled';
  end if;
  if p_visitor is null
    or p_host is null or p_host !~ '^[a-z0-9.-]{1,253}$'
    or p_path is null or char_length(p_path) not between 1 and 300 or left(p_path, 1) <> '/'
    or (p_referrer is not null and p_referrer !~ '^[a-z0-9.-]{1,253}$')
    or p_bucket is null or char_length(p_bucket) not between 1 and 100 then
    return 'invalid';
  end if;
  if not exists (
    select 1 from unnest(v_tracker.domains) d
    where p_host = d or right(p_host, char_length(d) + 1) = '.' || d
  ) then
    return 'host';
  end if;
  if v_tracker.consent_mode = 'ask' and not coalesce(p_consented, false) then
    return 'consent';
  end if;
  insert into public.site_rate_buckets (organization_id, tracker_id, bucket, window_start)
  values (v_tracker.organization_id, v_tracker.id, p_bucket, date_trunc('hour', now()))
  on conflict (tracker_id, bucket, window_start) do update set hits = public.site_rate_buckets.hits + 1
  returning hits into v_hits;
  delete from public.site_rate_buckets where tracker_id = v_tracker.id and window_start < now() - interval '1 day';
  if v_hits > 120 then
    return 'rate_limited';
  end if;
  select count(*) into v_today from public.site_page_views
  where tracker_id = v_tracker.id and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_today >= v_tracker.daily_limit then
    return 'rate_limited';
  end if;
  insert into public.site_visitors (organization_id, tracker_id, visitor_key)
  values (v_tracker.organization_id, v_tracker.id, p_visitor)
  on conflict (tracker_id, visitor_key) do update set last_seen_at = now()
  returning id into v_visitor;
  if p_message is not null and v_tracker.identify_from_email then
    select contact_id into v_contact from public.messages
    where id = p_message and organization_id = v_tracker.organization_id and status = 'sent' and contact_id is not null;
    if v_contact is not null then
      update public.site_visitors set contact_id = v_contact
      where id = v_visitor and organization_id = v_tracker.organization_id;
    end if;
  end if;
  insert into public.site_page_views (organization_id, tracker_id, visitor_id, host, path, referrer_host)
  values (v_tracker.organization_id, v_tracker.id, v_visitor, p_host, p_path, nullif(p_referrer, p_host));
  return 'ok';
end;
$$;
revoke all on function public.record_site_view(text, text, uuid, text, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.record_site_view(text, text, uuid, text, text, text, boolean, uuid) to service_role;

-- Daily purge, now also enforcing each tracker's retention.
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
  delete from public.site_page_views v using public.site_trackers t
  where t.id = v.tracker_id and v.created_at < now() - make_interval(days => t.retention_days);
  get diagnostics n = row_count;
  total := total + n;
  delete from public.site_visitors s using public.site_trackers t
  where t.id = s.tracker_id and s.last_seen_at < now() - make_interval(days => t.retention_days);
  get diagnostics n = row_count;
  total := total + n;
  delete from public.site_rate_buckets where window_start < now() - interval '1 day';
  get diagnostics n = row_count;
  total := total + n;
  return total;
end;
$$;
revoke all on function public.purge_old_events() from public, anon, authenticated;
grant execute on function public.purge_old_events() to service_role;
