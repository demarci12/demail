-- Agencies: a workspace can be an agency whose members reach its client workspaces with their agency role.
alter table public.organizations
  add column is_agency boolean not null default false,
  add column agency_id uuid references public.organizations (id) on delete set null,
  add constraint organizations_agency_not_self check (agency_id is null or agency_id <> id);
create index organizations_agency_idx on public.organizations (agency_id) where agency_id is not null;
-- One level only, a workspace joins an agency only at creation, and agency mode stays on while clients exist.
create function public.guard_agency_fields() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.agency_id is not null then
    if new.is_agency then
      raise exception 'an agency cannot be a client workspace';
    end if;
    perform 1 from public.organizations a
    where a.id = new.agency_id and a.is_agency and a.agency_id is null
    for share;
    if not found then
      raise exception 'a client workspace must belong to an agency workspace';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.agency_id is not null and new.agency_id is distinct from old.agency_id then
      raise exception 'a workspace joins an agency only when the agency creates it';
    end if;
    if old.is_agency and not new.is_agency and exists (select 1 from public.organizations c where c.agency_id = new.id) then
      raise exception 'release every client workspace before turning agency mode off';
    end if;
  end if;
  return new;
end;
$$;
create trigger organizations_guard_agency before insert or update of is_agency, agency_id on public.organizations
  for each row execute function public.guard_agency_fields();
-- Members may only rename a workspace; agency fields change through the definer functions below.
revoke update on public.organizations from anon, authenticated;
grant update (name) on public.organizations to authenticated;
-- Direct members, plus members of the agency that owns this client workspace.
create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.organizations o
    join public.organization_members m on m.organization_id = o.agency_id
    where o.id = org and m.user_id = auth.uid()
  );
$$;
-- An agency member's role applies unchanged in every client workspace of the agency.
create or replace function public.has_org_role(org uuid, roles public.member_role[]) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  ) or exists (
    select 1 from public.organizations o
    join public.organization_members m on m.organization_id = o.agency_id
    where o.id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;
-- Every workspace the caller can open, once each, with the strongest role.
create function public.my_workspaces()
returns table (id uuid, name text, role public.member_role, is_agency boolean, agency_id uuid, via_agency boolean)
language sql stable security definer
set search_path = ''
as $$
  select distinct on (w.id) w.id, w.name, w.role, w.is_agency, w.agency_id, w.via_agency
  from (
    select o.id, o.name, m.role, o.is_agency, o.agency_id, false as via_agency
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid()
    union all
    select c.id, c.name, m.role, c.is_agency, c.agency_id, true as via_agency
    from public.organization_members m
    join public.organizations c on c.agency_id = m.organization_id
    where m.user_id = auth.uid()
  ) w
  order by w.id, case w.role when 'owner' then 0 when 'admin' then 1 else 2 end, w.via_agency;
$$;
create function public.set_agency_mode(p_org uuid, p_on boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.organizations set is_agency = p_on where id = p_org;
end;
$$;
create function public.create_client_workspace(p_agency uuid, p_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.has_org_role(p_agency, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations a where a.id = p_agency and a.is_agency) then
    raise exception 'not an agency workspace' using errcode = '42501';
  end if;
  insert into public.organizations (name, created_by, agency_id)
  values (btrim(p_name), auth.uid(), p_agency)
  returning id into new_id;
  return new_id;
end;
$$;
create function public.detach_client_workspace(p_client uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_agency uuid;
begin
  select o.agency_id into v_agency from public.organizations o where o.id = p_client for update;
  if auth.uid() is null or not (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = p_client and m.user_id = auth.uid() and m.role = 'owner'
    ) or exists (
      select 1 from public.organization_members m
      where v_agency is not null and m.organization_id = v_agency and m.user_id = auth.uid() and m.role = 'owner'
    )
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_agency is null then
    raise exception 'not a client workspace';
  end if;
  if not exists (select 1 from public.organization_members m where m.organization_id = p_client and m.role = 'owner') then
    raise exception 'a client workspace needs its own owner before it leaves the agency';
  end if;
  update public.organizations set agency_id = null where id = p_client;
end;
$$;
-- Runs as the caller, so row level security applies to every count.
create function public.agency_clients(p_agency uuid)
returns table (
  id uuid, name text, created_at timestamptz, contacts bigint, active_campaigns bigint,
  sent_7d bigint, unread_threads bigint, direct_owners bigint
)
language sql stable security invoker
set search_path = ''
as $$
  select c.id, c.name, c.created_at,
    (select count(*) from public.contacts x where x.organization_id = c.id),
    (select count(*) from public.campaigns x where x.organization_id = c.id and x.status = 'active'),
    (select count(*) from public.messages x
      where x.organization_id = c.id and x.status = 'sent' and x.sent_at >= now() - interval '7 days'),
    (select count(*) from public.threads x where x.organization_id = c.id and x.status = 'open' and x.is_unread),
    (select count(*) from public.organization_members x where x.organization_id = c.id and x.role = 'owner')
  from public.organizations c
  where c.agency_id = p_agency and public.is_org_member(p_agency)
  order by c.name;
$$;
-- The agency that manages a workspace, shown only to those who can open that workspace.
create function public.workspace_agency(p_org uuid) returns table (agency_id uuid, agency_name text)
language sql stable security definer
set search_path = ''
as $$
  select a.id, a.name
  from public.organizations o
  join public.organizations a on a.id = o.agency_id
  where o.id = p_org and public.is_org_member(p_org);
$$;
revoke all on function public.guard_agency_fields() from public, anon, authenticated;
revoke all on function public.my_workspaces(), public.set_agency_mode(uuid, boolean),
  public.create_client_workspace(uuid, text), public.detach_client_workspace(uuid),
  public.agency_clients(uuid), public.workspace_agency(uuid) from public, anon;
grant execute on function public.my_workspaces(), public.set_agency_mode(uuid, boolean),
  public.create_client_workspace(uuid, text), public.detach_client_workspace(uuid),
  public.agency_clients(uuid), public.workspace_agency(uuid) to authenticated, service_role;
