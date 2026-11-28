-- Optional enrichment and consensus verification: off by default, member-clicked, capped per day. Provider keys are sealed by the app and readable only by the service role.
create table public.enrichment_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  daily_call_limit integer not null default 100 check (daily_call_limit between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger enrichment_settings_updated_at before update on public.enrichment_settings
  for each row execute function public.set_updated_at();
create trigger enrichment_settings_org_immutable before update on public.enrichment_settings
  for each row execute function public.prevent_org_change();
alter table public.enrichment_settings enable row level security;
create policy enrichment_settings_select on public.enrichment_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy enrichment_settings_insert on public.enrichment_settings for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy enrichment_settings_update on public.enrichment_settings for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
grant all on public.enrichment_settings to service_role;

-- An ordered provider list per workspace and role: 'enrich' finds email and phone, 'verify' votes on an address.
create table public.enrichment_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role text not null check (role in ('enrich', 'verify')),
  kind text not null check (kind in ('hunter', 'apollo', 'millionverifier', 'http')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  base_url text check (base_url is null or (char_length(base_url) <= 300 and base_url ~ '^https://[^[:space:]]+$')),
  position integer not null default 0 check (position between 0 and 50),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check ((role = 'enrich' and kind in ('hunter', 'apollo', 'http')) or (role = 'verify' and kind in ('millionverifier', 'http'))),
  check ((kind = 'http') = (base_url is not null))
);
create index enrichment_providers_org_idx on public.enrichment_providers (organization_id, role, position);
create trigger enrichment_providers_org_immutable before update on public.enrichment_providers
  for each row execute function public.prevent_org_change();
alter table public.enrichment_providers enable row level security;
create policy enrichment_providers_select on public.enrichment_providers for select to authenticated
  using (public.is_org_member(organization_id));
create policy enrichment_providers_insert on public.enrichment_providers for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy enrichment_providers_update on public.enrichment_providers for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy enrichment_providers_delete on public.enrichment_providers for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
grant all on public.enrichment_providers to service_role;

-- Sealed provider keys; no policy and no grant for signed-in users.
create table public.enrichment_credentials (
  provider_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ciphertext text not null,
  key_hint text not null check (char_length(key_hint) between 1 and 8),
  updated_at timestamptz not null default now(),
  foreign key (provider_id, organization_id) references public.enrichment_providers (id, organization_id) on delete cascade
);
create trigger enrichment_credentials_updated_at before update on public.enrichment_credentials
  for each row execute function public.set_updated_at();
alter table public.enrichment_credentials enable row level security;
revoke all on public.enrichment_credentials from anon, authenticated;
grant all on public.enrichment_credentials to service_role;

-- Provider calls per workspace and UTC day, written only by reserve_enrichment_call.
create table public.enrichment_usage (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (organization_id, day)
);
alter table public.enrichment_usage enable row level security;
create policy enrichment_usage_select on public.enrichment_usage for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.enrichment_usage from anon, authenticated;
grant all on public.enrichment_usage to service_role;

-- A found value with where and when it was found; contacts.email is never changed, a found address is kept beside it.
create table public.contact_enrichment (
  contact_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  field text not null check (field in ('email', 'phone')),
  value text not null check (char_length(value) between 3 and 320),
  source text not null check (char_length(source) between 1 and 60),
  found_at timestamptz not null default now(),
  primary key (contact_id, field),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);
create index contact_enrichment_org_idx on public.contact_enrichment (organization_id);
alter table public.contact_enrichment enable row level security;
create policy contact_enrichment_select on public.contact_enrichment for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.contact_enrichment from anon, authenticated;
grant all on public.contact_enrichment to service_role;

-- Consensus result next to the built-in one; only the service role writes it, and an edited address loses it.
alter table public.contacts
  add column consensus_status text check (consensus_status in ('valid', 'risky', 'invalid')),
  add column consensus_votes smallint check (consensus_votes between 0 and 3),
  add column consensus_catch_all boolean not null default false,
  add column consensus_at timestamptz;

create function public.guard_contact_consensus() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.consensus_status := null;
      new.consensus_votes := null;
      new.consensus_catch_all := false;
      new.consensus_at := null;
    end if;
    return new;
  end if;
  if lower(new.email) is distinct from lower(old.email) then
    new.consensus_status := null;
    new.consensus_votes := null;
    new.consensus_catch_all := false;
    new.consensus_at := null;
  elsif current_user in ('anon', 'authenticated') then
    new.consensus_status := old.consensus_status;
    new.consensus_votes := old.consensus_votes;
    new.consensus_catch_all := old.consensus_catch_all;
    new.consensus_at := old.consensus_at;
  end if;
  return new;
end;
$$;
create trigger contacts_guard_consensus before insert or update on public.contacts
  for each row execute function public.guard_contact_consensus();

-- Takes one call from today's cap before the HTTP request; false when enrichment is off or the cap is reached.
create function public.reserve_enrichment_call(p_org uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit integer;
  v_used integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  select s.enabled, s.daily_call_limit into v_enabled, v_limit from public.enrichment_settings s where s.organization_id = p_org;
  if not found or not v_enabled then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('demail:enrichment:' || p_org::text, 0));
  select coalesce(u.calls, 0) into v_used from public.enrichment_usage u where u.organization_id = p_org and u.day = v_today;
  if coalesce(v_used, 0) >= v_limit then
    return false;
  end if;
  insert into public.enrichment_usage (organization_id, day, calls) values (p_org, v_today, 1)
  on conflict (organization_id, day) do update set calls = public.enrichment_usage.calls + 1;
  return true;
end;
$$;

-- Stores found values for one organization. Phone fills a blank contacts.phone only; nothing existing is overwritten.
create function public.set_contact_enrichment(p_org uuid, p_results jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    return 0;
  end if;
  insert into public.contact_enrichment (contact_id, organization_id, field, value, source)
  select r.id, p_org, r.field, r.value, left(r.source, 60)
  from jsonb_to_recordset(p_results) as r(id uuid, field text, value text, source text)
  join public.contacts c on c.id = r.id and c.organization_id = p_org
  where r.field in ('email', 'phone') and r.value is not null and r.source is not null
  on conflict (contact_id, field) do nothing;
  get diagnostics n = row_count;
  update public.contacts c
  set phone = r.value
  from jsonb_to_recordset(p_results) as r(id uuid, field text, value text, source text)
  where c.id = r.id and c.organization_id = p_org and r.field = 'phone' and r.value is not null
    and char_length(r.value) <= 40 and coalesce(btrim(c.phone), '') = '';
  return n;
end;
$$;

-- Stores consensus results. The built-in verify_status is only ever made stricter: invalid stays invalid and risky never becomes valid.
create function public.set_contact_consensus(p_org uuid, p_results jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    return 0;
  end if;
  update public.contacts c
  set consensus_status = r.status,
      consensus_votes = r.votes,
      consensus_catch_all = coalesce(r.catch_all, false),
      consensus_at = now(),
      verify_status = case
        when c.verify_status = 'invalid' then 'invalid'
        when c.verify_status = 'risky' and r.status = 'valid' then 'risky'
        else r.status
      end,
      verify_reason = case
        when c.verify_status = 'invalid' or (c.verify_status = 'risky' and r.status = 'valid') then c.verify_reason
        else 'consensus'
      end,
      verify_flags = case
        when coalesce(r.catch_all, false) and not ('catch_all' = any (c.verify_flags)) and cardinality(c.verify_flags) < 8
          then array_append(c.verify_flags, 'catch_all')
        else c.verify_flags
      end,
      verified_at = coalesce(c.verified_at, now())
  from jsonb_to_recordset(p_results) as r(id uuid, email text, status text, votes smallint, catch_all boolean)
  where c.id = r.id
    and c.organization_id = p_org
    and lower(c.email) = lower(r.email)
    and r.status in ('valid', 'risky', 'invalid')
    and r.votes between 2 and 3;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.guard_contact_consensus(), public.reserve_enrichment_call(uuid),
  public.set_contact_enrichment(uuid, jsonb), public.set_contact_consensus(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_enrichment_call(uuid), public.set_contact_enrichment(uuid, jsonb),
  public.set_contact_consensus(uuid, jsonb) to service_role;

-- Signed-in users reach these tables only through the RLS policies above; anon reaches none of them.
revoke all on public.enrichment_settings, public.enrichment_providers, public.enrichment_usage, public.contact_enrichment from anon;
