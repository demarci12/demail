-- Agency shared limits: a monthly campaign send pool, a monthly AI call pool and an opt-in shared AI key (all off by default).
create table public.agency_pools (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  monthly_send_pool integer check (monthly_send_pool is null or monthly_send_pool between 1 and 10000000),
  monthly_ai_pool integer check (monthly_ai_pool is null or monthly_ai_pool between 1 and 1000000),
  share_ai_key boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger agency_pools_updated_at before update on public.agency_pools
  for each row execute function public.set_updated_at();
create trigger agency_pools_org_immutable before update on public.agency_pools
  for each row execute function public.prevent_org_change();
-- Shared limits belong to agency workspaces only.
create function public.guard_pool_agency() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations o where o.id = new.organization_id and o.is_agency) then
    raise exception 'shared limits are only available to agency workspaces';
  end if;
  return new;
end;
$$;
create trigger agency_pools_guard_agency before insert or update on public.agency_pools
  for each row execute function public.guard_pool_agency();
alter table public.agency_pools enable row level security;
create policy agency_pools_select on public.agency_pools for select to authenticated
  using (public.is_org_member(organization_id));
create policy agency_pools_insert on public.agency_pools for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy agency_pools_update on public.agency_pools for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy agency_pools_delete on public.agency_pools for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.agency_pools from anon;
grant select, insert, update, delete on public.agency_pools to authenticated;
grant all on public.agency_pools to service_role;
-- Per-client monthly caps, keyed by agency so caps of a former agency never apply under a new one.
create table public.agency_client_caps (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  agency_id uuid not null references public.organizations (id) on delete cascade,
  monthly_send_cap integer check (monthly_send_cap is null or monthly_send_cap between 1 and 10000000),
  monthly_ai_cap integer check (monthly_ai_cap is null or monthly_ai_cap between 1 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, agency_id)
);
create index agency_client_caps_agency_idx on public.agency_client_caps (agency_id);
create trigger agency_client_caps_updated_at before update on public.agency_client_caps
  for each row execute function public.set_updated_at();
create trigger agency_client_caps_org_immutable before update on public.agency_client_caps
  for each row execute function public.prevent_org_change();
create function public.guard_client_cap() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations o where o.id = new.organization_id and o.agency_id = new.agency_id) then
    raise exception 'caps belong to a client workspace of this agency';
  end if;
  return new;
end;
$$;
create trigger agency_client_caps_guard_client before insert or update on public.agency_client_caps
  for each row execute function public.guard_client_cap();
alter table public.agency_client_caps enable row level security;
create policy agency_client_caps_select on public.agency_client_caps for select to authenticated
  using (public.is_org_member(organization_id));
create policy agency_client_caps_insert on public.agency_client_caps for insert to authenticated
  with check (public.has_org_role(agency_id, array['owner', 'admin']::public.member_role[]));
create policy agency_client_caps_update on public.agency_client_caps for update to authenticated
  using (public.has_org_role(agency_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(agency_id, array['owner', 'admin']::public.member_role[]));
create policy agency_client_caps_delete on public.agency_client_caps for delete to authenticated
  using (public.has_org_role(agency_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.agency_client_caps from anon;
grant select, insert, update, delete on public.agency_client_caps to authenticated;
grant all on public.agency_client_caps to service_role;
revoke all on function public.guard_pool_agency(), public.guard_client_cap() from public, anon, authenticated;
create index messages_org_sent_idx on public.messages (organization_id, sent_at) where status = 'sent';
alter table public.ai_usage drop constraint ai_usage_source_check,
  add constraint ai_usage_source_check check (source in ('workspace', 'instance', 'agency'));
-- Send pool state for the send tick: no row when the workspace is in no agency or no limit is set.
create function public.send_pool_state(p_org uuid) returns table (agency_id uuid, pool_left integer, cap_left integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_agency uuid;
  v_pool integer;
  v_cap integer;
  v_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_pool_left integer;
  v_cap_left integer;
begin
  select case when o.is_agency then o.id else o.agency_id end into v_agency
  from public.organizations o
  where o.id = p_org;
  if v_agency is null then
    return;
  end if;
  select p.monthly_send_pool into v_pool from public.agency_pools p where p.organization_id = v_agency;
  if p_org <> v_agency then
    select c.monthly_send_cap into v_cap
    from public.agency_client_caps c
    where c.organization_id = p_org and c.agency_id = v_agency;
  end if;
  if v_pool is null and v_cap is null then
    return;
  end if;
  if v_pool is not null then
    select greatest(v_pool - count(*), 0)::integer into v_pool_left
    from public.messages m
    where m.status = 'sent' and m.sent_at >= v_start
      and m.organization_id in (select o.id from public.organizations o where o.id = v_agency or o.agency_id = v_agency);
  end if;
  if v_cap is not null then
    select greatest(v_cap - count(*), 0)::integer into v_cap_left
    from public.messages m
    where m.status = 'sent' and m.sent_at >= v_start and m.organization_id = p_org;
  end if;
  agency_id := v_agency;
  pool_left := v_pool_left;
  cap_left := v_cap_left;
  return next;
end;
$$;
-- A client workspace's caps and this UTC month's usage, for those who can open it.
create function public.workspace_pool_usage(p_org uuid)
returns table (
  agency_id uuid, monthly_send_cap integer, sent_this_month bigint, send_pool_reached boolean,
  monthly_ai_cap integer, ai_calls_this_month bigint, ai_pool_reached boolean, agency_key_available boolean
)
language sql stable security definer
set search_path = ''
as $$
  with w as (
    select o.id, o.agency_id
    from public.organizations o
    where o.id = p_org and o.agency_id is not null and public.is_org_member(p_org)
  ), m as (
    select date_trunc('month', now() at time zone 'utc') at time zone 'utc' as t,
      (date_trunc('month', now() at time zone 'utc'))::date as d
  )
  select w.agency_id, c.monthly_send_cap,
    (select count(*) from public.messages x
      where x.organization_id = w.id and x.status = 'sent' and x.sent_at >= m.t),
    coalesce(p.monthly_send_pool is not null and (select count(*) from public.messages x
      where x.status = 'sent' and x.sent_at >= m.t
        and x.organization_id in (select o.id from public.organizations o where o.id = w.agency_id or o.agency_id = w.agency_id)
    ) >= p.monthly_send_pool, false),
    c.monthly_ai_cap,
    (select coalesce(sum(u.calls), 0)::bigint from public.ai_usage u
      where u.organization_id = w.id and u.source = 'agency' and u.day >= m.d),
    coalesce(p.monthly_ai_pool is not null and (select coalesce(sum(u.calls), 0) from public.ai_usage u
      where u.day >= m.d and (
        (u.organization_id = w.agency_id and u.source = 'workspace')
        or (u.source = 'agency' and u.organization_id in (select o.id from public.organizations o where o.agency_id = w.agency_id))
      )) >= p.monthly_ai_pool, false),
    coalesce(p.share_ai_key, false) and coalesce(s.enabled, false)
      and exists (select 1 from public.ai_credentials k where k.organization_id = w.agency_id)
  from w
  cross join m
  left join public.agency_pools p on p.organization_id = w.agency_id
  left join public.agency_client_caps c on c.organization_id = w.id and c.agency_id = w.agency_id
  left join public.ai_settings s on s.organization_id = w.agency_id;
$$;
-- This UTC month's usage of the agency (AI: its own workspace-key calls) and each client (AI: agency-key calls).
create function public.agency_pool_usage(p_agency uuid)
returns table (organization_id uuid, sent_this_month bigint, ai_calls_this_month bigint)
language sql stable security invoker
set search_path = ''
as $$
  select o.id,
    (select count(*) from public.messages x
      where x.organization_id = o.id and x.status = 'sent'
        and x.sent_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'),
    (select coalesce(sum(u.calls), 0)::bigint from public.ai_usage u
      where u.organization_id = o.id
        and u.source = case when o.id = p_agency then 'workspace' else 'agency' end
        and u.day >= (date_trunc('month', now() at time zone 'utc'))::date)
  from public.organizations o
  where (o.id = p_agency or o.agency_id = p_agency) and public.is_org_member(p_agency);
$$;
revoke all on function public.send_pool_state(uuid) from public, anon, authenticated;
grant execute on function public.send_pool_state(uuid) to service_role;
revoke all on function public.workspace_pool_usage(uuid), public.agency_pool_usage(uuid) from public, anon;
grant execute on function public.workspace_pool_usage(uuid), public.agency_pool_usage(uuid) to authenticated, service_role;
-- Reserves one call before the HTTP request; locks are always taken org first, then agency, then instance.
create or replace function public.reserve_ai_call(p_org uuid, p_source text, p_instance_limit integer) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit integer;
  v_today date;
  v_used integer;
  v_is_agency boolean;
  v_agency uuid;
  v_pool_agency uuid;
  v_pool integer;
  v_cap integer;
  v_month date;
begin
  if p_source is null or p_source not in ('workspace', 'instance', 'agency') then
    raise exception 'invalid AI usage source';
  end if;
  select s.enabled, s.daily_call_limit into v_enabled, v_limit
  from public.ai_settings s
  where s.organization_id = p_org;
  if not found or not v_enabled then
    return false;
  end if;
  v_today := (now() at time zone 'utc')::date;
  perform pg_advisory_xact_lock(hashtextextended('demail:ai:' || p_org::text, 0));
  select coalesce(sum(u.calls), 0) into v_used
  from public.ai_usage u
  where u.organization_id = p_org and u.day = v_today;
  if v_used >= v_limit then
    return false;
  end if;
  select o.is_agency, o.agency_id into v_is_agency, v_agency
  from public.organizations o
  where o.id = p_org;
  if p_source = 'agency' then
    if v_agency is null
      or not exists (select 1 from public.agency_pools p where p.organization_id = v_agency and p.share_ai_key)
      or not exists (select 1 from public.ai_settings s where s.organization_id = v_agency and s.enabled) then
      return false;
    end if;
    v_pool_agency := v_agency;
  elsif p_source = 'workspace' and coalesce(v_is_agency, false) then
    v_pool_agency := p_org;
  end if;
  if v_pool_agency is not null then
    perform pg_advisory_xact_lock(hashtextextended('demail:ai:agency:' || v_pool_agency::text, 0));
    v_month := (date_trunc('month', now() at time zone 'utc'))::date;
    select p.monthly_ai_pool into v_pool from public.agency_pools p where p.organization_id = v_pool_agency;
    if v_pool is not null then
      select coalesce(sum(u.calls), 0) into v_used
      from public.ai_usage u
      where u.day >= v_month and (
        (u.organization_id = v_pool_agency and u.source = 'workspace')
        or (u.source = 'agency' and u.organization_id in (select o.id from public.organizations o where o.agency_id = v_pool_agency))
      );
      if v_used >= v_pool then
        return false;
      end if;
    end if;
    if p_source = 'agency' then
      select c.monthly_ai_cap into v_cap
      from public.agency_client_caps c
      where c.organization_id = p_org and c.agency_id = v_pool_agency;
      if v_cap is not null then
        select coalesce(sum(u.calls), 0) into v_used
        from public.ai_usage u
        where u.organization_id = p_org and u.source = 'agency' and u.day >= v_month;
        if v_used >= v_cap then
          return false;
        end if;
      end if;
    end if;
  end if;
  if p_source = 'instance' then
    perform pg_advisory_xact_lock(hashtextextended('demail:ai:instance', 0));
    select coalesce(sum(u.calls), 0) into v_used
    from public.ai_usage u
    where u.day = v_today and u.source = 'instance';
    if v_used >= coalesce(p_instance_limit, 0) then
      return false;
    end if;
  end if;
  insert into public.ai_usage (organization_id, day, source, calls)
  values (p_org, v_today, p_source, 1)
  on conflict (organization_id, day, source) do update set calls = public.ai_usage.calls + 1;
  return true;
end;
$$;
