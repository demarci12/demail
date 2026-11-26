-- HubSpot sync: one connection per workspace, a service-only sealed token, contact links and a leased claim queue.
create table public.crm_connections (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider = 'hubspot'),
  enabled boolean not null default true,
  pull_contacts boolean not null default true,
  push_replies boolean not null default true,
  label_id uuid,
  portal_id text check (portal_id is null or char_length(portal_id) <= 40),
  pull_cursor bigint,
  push_cursor timestamptz not null default now(),
  next_sync_at timestamptz not null default now(),
  lease_until timestamptz,
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  consecutive_errors integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider),
  foreign key (label_id, organization_id) references public.labels (id, organization_id) on delete set null (label_id)
);
create index crm_connections_due_idx on public.crm_connections (next_sync_at) where enabled;
create trigger crm_connections_updated_at before update on public.crm_connections
  for each row execute function public.set_updated_at();
create trigger crm_connections_org_immutable before update on public.crm_connections
  for each row execute function public.prevent_org_change();
alter table public.crm_connections enable row level security;
create policy crm_connections_select on public.crm_connections for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.crm_connections from anon, authenticated;
grant all on public.crm_connections to service_role;
create table public.crm_credentials (
  organization_id uuid not null,
  provider text not null,
  ciphertext text not null,
  key_hint text not null check (char_length(key_hint) between 1 and 8),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider),
  foreign key (organization_id, provider) references public.crm_connections (organization_id, provider) on delete cascade
);
create trigger crm_credentials_updated_at before update on public.crm_credentials
  for each row execute function public.set_updated_at();
alter table public.crm_credentials enable row level security;
revoke all on public.crm_credentials from anon, authenticated;
grant all on public.crm_credentials to service_role;
create table public.crm_contact_links (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider = 'hubspot'),
  contact_id uuid not null,
  external_id text not null check (char_length(external_id) between 1 and 40),
  synced_at timestamptz not null default now(),
  primary key (contact_id, provider),
  unique (organization_id, provider, external_id),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);
create trigger crm_contact_links_org_immutable before update on public.crm_contact_links
  for each row execute function public.prevent_org_change();
alter table public.crm_contact_links enable row level security;
create policy crm_contact_links_select on public.crm_contact_links for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.crm_contact_links from anon, authenticated;
grant all on public.crm_contact_links to service_role;
-- Leases due connections for 10 minutes so overlapping ticks never sync the same workspace twice.
create function public.claim_due_crm_syncs(batch integer, p_org uuid default null) returns setof public.crm_connections
language sql security definer
set search_path = ''
as $$
  with due as (
    select organization_id, provider
    from public.crm_connections
    where enabled
      and next_sync_at <= now()
      and (lease_until is null or lease_until < now())
      and (p_org is null or organization_id = p_org)
    order by next_sync_at
    limit greatest(batch, 0)
    for update skip locked
  )
  update public.crm_connections c
  set lease_until = now() + interval '10 minutes'
  from due
  where c.organization_id = due.organization_id and c.provider = due.provider
  returning c.*;
$$;
revoke all on function public.claim_due_crm_syncs(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_due_crm_syncs(integer, uuid) to service_role;
