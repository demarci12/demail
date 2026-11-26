-- White-label: one branding row per agency workspace, shown in the agency and its client workspaces.
create table public.org_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 60),
  logo_url text check (logo_url is null or (char_length(logo_url) <= 500 and logo_url ~ '^https://')),
  support_url text check (support_url is null or (char_length(support_url) <= 500 and support_url ~ '^https://')),
  privacy_url text check (privacy_url is null or (char_length(privacy_url) <= 500 and privacy_url ~ '^https://')),
  terms_url text check (terms_url is null or (char_length(terms_url) <= 500 and terms_url ~ '^https://')),
  accent_color text not null default '#0284c7' check (accent_color ~ '^#[0-9a-f]{6}$'),
  hide_powered_by boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger org_branding_updated_at before update on public.org_branding
  for each row execute function public.set_updated_at();
create trigger org_branding_org_immutable before update on public.org_branding
  for each row execute function public.prevent_org_change();
-- Branding belongs to agency workspaces only.
create function public.guard_branding_agency() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations o where o.id = new.organization_id and o.is_agency) then
    raise exception 'branding is only available to agency workspaces';
  end if;
  return new;
end;
$$;
create trigger org_branding_guard_agency before insert or update on public.org_branding
  for each row execute function public.guard_branding_agency();
alter table public.org_branding enable row level security;
create policy org_branding_select on public.org_branding for select to authenticated
  using (public.is_org_member(organization_id));
create policy org_branding_insert on public.org_branding for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy org_branding_update on public.org_branding for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy org_branding_delete on public.org_branding for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.org_branding from anon;
grant select, insert, update, delete on public.org_branding to authenticated;
grant all on public.org_branding to service_role;
-- The brand that applies to a workspace: its own as an agency, else its agency's, for those who can open it.
create function public.workspace_branding(p_org uuid) returns setof public.org_branding
language sql stable security definer
set search_path = ''
as $$
  select b.*
  from public.organizations o
  join public.organizations a on a.id = case when o.is_agency then o.id else o.agency_id end and a.is_agency
  join public.org_branding b on b.organization_id = a.id
  where o.id = p_org and public.is_org_member(p_org);
$$;
revoke all on function public.guard_branding_agency() from public, anon, authenticated;
revoke all on function public.workspace_branding(uuid) from public, anon;
grant execute on function public.workspace_branding(uuid) to authenticated, service_role;
