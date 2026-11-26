-- Per-workspace AI settings (off by default), sealed workspace keys and atomic daily call limits.
create table public.ai_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  base_url text check (base_url is null or (char_length(base_url) <= 300 and base_url ~ '^https://[^[:space:]]+$')),
  model text check (model is null or char_length(btrim(model)) between 1 and 100),
  daily_call_limit integer not null default 100 check (daily_call_limit between 1 and 5000),
  classify_replies boolean not null default false,
  classify_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_settings_updated_at before update on public.ai_settings
  for each row execute function public.set_updated_at();
create trigger ai_settings_org_immutable before update on public.ai_settings
  for each row execute function public.prevent_org_change();
alter table public.ai_settings enable row level security;
create policy ai_settings_select on public.ai_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy ai_settings_insert on public.ai_settings for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy ai_settings_update on public.ai_settings for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
grant all on public.ai_settings to service_role;
-- Workspace AI keys are sealed by the app before they reach the database; only the service role can read this table.
create table public.ai_credentials (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  ciphertext text not null,
  key_hint text not null check (char_length(key_hint) between 1 and 8),
  updated_at timestamptz not null default now()
);
create trigger ai_credentials_updated_at before update on public.ai_credentials
  for each row execute function public.set_updated_at();
alter table public.ai_credentials enable row level security;
revoke all on public.ai_credentials from anon, authenticated;
grant all on public.ai_credentials to service_role;
-- Calls per workspace, UTC day and key source; written only through reserve_ai_call and record_ai_tokens.
create table public.ai_usage (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  source text not null check (source in ('workspace', 'instance')),
  calls integer not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  primary key (organization_id, day, source)
);
create index ai_usage_day_idx on public.ai_usage (day, source);
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;
-- Reserves one call before the HTTP request; locks are always taken org first, then instance.
create function public.reserve_ai_call(p_org uuid, p_source text, p_instance_limit integer) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit integer;
  v_today date;
  v_used integer;
begin
  if p_source is null or p_source not in ('workspace', 'instance') then
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
create function public.record_ai_tokens(p_org uuid, p_source text, p_prompt integer, p_completion integer) returns void
language sql security definer
set search_path = ''
as $$
  update public.ai_usage
  set prompt_tokens = prompt_tokens + greatest(coalesce(p_prompt, 0), 0),
      completion_tokens = completion_tokens + greatest(coalesce(p_completion, 0), 0)
  where organization_id = p_org and day = (now() at time zone 'utc')::date and source = p_source;
$$;
revoke all on function public.reserve_ai_call(uuid, text, integer), public.record_ai_tokens(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_call(uuid, text, integer), public.record_ai_tokens(uuid, text, integer, integer)
  to service_role;
