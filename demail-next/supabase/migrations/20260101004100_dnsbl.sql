-- DNS blocklist (DNSBL) monitoring: results per domain and list, an opt-in per-workspace auto-pause, and the pauses themselves.
-- Additive: the previous release ignores these tables, and the sender reads them only through the service role.

-- One row per (workspace, domain, list). status is clean, listed, or unknown (a refused or failed query is never "listed").
create table public.dnsbl_results (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain text not null check (char_length(domain) <= 253 and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'),
  kind text not null check (kind in ('sending', 'portal')),
  list text not null check (char_length(list) <= 253 and list ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
  status text not null check (status in ('clean', 'listed', 'unknown')),
  answer text check (answer is null or char_length(answer) <= 64),
  listed_since timestamptz,
  checked_at timestamptz not null default now(),
  primary key (organization_id, domain, list)
);
create index dnsbl_results_checked_idx on public.dnsbl_results (checked_at);
alter table public.dnsbl_results enable row level security;
create policy dnsbl_results_select on public.dnsbl_results for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.dnsbl_results from anon, authenticated;
grant select on public.dnsbl_results to authenticated;
grant all on public.dnsbl_results to service_role;

-- Auto-pause is off until an owner or admin turns it on.
create table public.dnsbl_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  auto_pause boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger dnsbl_settings_org_immutable before update on public.dnsbl_settings
  for each row execute function public.prevent_org_change();
alter table public.dnsbl_settings enable row level security;
create policy dnsbl_settings_select on public.dnsbl_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy dnsbl_settings_insert on public.dnsbl_settings for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy dnsbl_settings_update on public.dnsbl_settings for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.dnsbl_settings from anon, authenticated;
grant select on public.dnsbl_settings to authenticated;
grant insert (organization_id, auto_pause), update (auto_pause, updated_at) on public.dnsbl_settings to authenticated;
grant all on public.dnsbl_settings to service_role;

-- A paused domain stops cold sending from its mailboxes. Written only by the service role.
-- resumed_at is kept after a resume so only a listing that starts later pauses the domain again.
create table public.dnsbl_pauses (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  domain text not null check (char_length(domain) <= 253),
  active boolean not null default true,
  reason text check (reason is null or char_length(reason) <= 500),
  paused_at timestamptz not null default now(),
  resumed_at timestamptz,
  resumed_by uuid references auth.users (id) on delete set null,
  primary key (organization_id, domain)
);
create index dnsbl_pauses_active_idx on public.dnsbl_pauses (organization_id) where active;
alter table public.dnsbl_pauses enable row level security;
create policy dnsbl_pauses_select on public.dnsbl_pauses for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.dnsbl_pauses from anon, authenticated;
grant select on public.dnsbl_pauses to authenticated;
grant all on public.dnsbl_pauses to service_role;

-- Domains whose newest result is older than p_stale_hours (or that have none), oldest first. Service role only.
create function public.dnsbl_due_targets(p_limit integer, p_stale_hours integer)
returns table (organization_id uuid, domain text, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.organization_id, t.domain, t.kind
  from (
    select s.organization_id, lower(s.domain) as domain, 'sending'::text as kind from public.sending_domains s
    union
    select p.organization_id, lower(p.hostname), 'portal'::text from public.portal_domains p where p.verified_at is not null
  ) t
  left join lateral (
    select max(r.checked_at) as last_checked
    from public.dnsbl_results r
    where r.organization_id = t.organization_id and r.domain = t.domain
  ) l on true
  where l.last_checked is null or l.last_checked < now() - make_interval(hours => greatest(p_stale_hours, 1))
  order by l.last_checked asc nulls first
  limit greatest(least(p_limit, 200), 1);
$$;
revoke all on function public.dnsbl_due_targets(integer, integer) from public, anon, authenticated;
grant execute on function public.dnsbl_due_targets(integer, integer) to service_role;
