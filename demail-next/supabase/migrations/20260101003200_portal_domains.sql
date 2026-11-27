-- Custom portal domain: one hostname per agency, proven by a DNS TXT record and verified only by the service role.
create table public.portal_domains (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  hostname text not null check (
    char_length(hostname) <= 253
    and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  verify_token text not null default replace(gen_random_uuid()::text, '-', '') check (verify_token ~ '^[0-9a-f]{32}$'),
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Unique only among verified rows, so an unverified claim never blocks the real owner.
create unique index portal_domains_verified_host on public.portal_domains (hostname) where verified_at is not null;
create index portal_domains_recheck_idx on public.portal_domains (verified_at, last_checked_at);
create trigger portal_domains_guard_agency before insert or update on public.portal_domains
  for each row execute function public.guard_branding_agency();
create trigger portal_domains_updated_at before update on public.portal_domains
  for each row execute function public.set_updated_at();
create trigger portal_domains_org_immutable before update on public.portal_domains
  for each row execute function public.prevent_org_change();
alter table public.portal_domains enable row level security;
create policy portal_domains_select on public.portal_domains for select to authenticated
  using (public.is_org_member(organization_id));
create policy portal_domains_insert on public.portal_domains for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy portal_domains_delete on public.portal_domains for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.portal_domains from anon;
revoke insert, update on public.portal_domains from authenticated;
grant select, delete on public.portal_domains to authenticated;
grant insert (organization_id, hostname) on public.portal_domains to authenticated;
grant all on public.portal_domains to service_role;
