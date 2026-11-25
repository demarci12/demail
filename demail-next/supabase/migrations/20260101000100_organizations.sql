-- Organizations, membership, invitations, RLS helpers and the RPCs that are the only way in.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.member_role not null default 'member',
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_org_idx on public.invitations (organization_id);

create function public.is_org_member(org uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create function public.has_org_role(org uuid, roles public.member_role[]) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

-- The last owner cannot be demoted or removed while the organization exists.
create function public.guard_last_owner() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'an organization needs at least one owner';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger organization_members_guard_last_owner before update or delete on public.organization_members
  for each row execute function public.guard_last_owner();

create function public.create_organization(org_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.organizations (name, created_by) values (org_name, uid) returning id into new_id;
  insert into public.organization_members (organization_id, user_id, role) values (new_id, uid, 'owner');
  return new_id;
end;
$$;

-- Returns the raw token once; only its sha256 is stored.
create function public.create_invitation(org uuid, invitee_email text, invitee_role public.member_role)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  raw text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  clean text := lower(btrim(invitee_email));
begin
  if uid is null or not public.has_org_role(org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if invitee_role = 'owner' and not public.has_org_role(org, array['owner']::public.member_role[]) then
    raise exception 'only an owner can invite an owner' using errcode = '42501';
  end if;
  if clean !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  delete from public.invitations where organization_id = org and email = clean and accepted_at is null;
  insert into public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  values (org, clean, invitee_role, encode(sha256(convert_to(raw, 'utf8')), 'hex'), uid, now() + interval '7 days');
  return raw;
end;
$$;

create function public.accept_invitation(token text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  inv public.invitations;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into inv from public.invitations
  where token_hash = encode(sha256(convert_to(token, 'utf8')), 'hex')
  for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() or inv.email <> caller_email then
    raise exception 'invitation is invalid or expired' using errcode = 'P0001';
  end if;
  insert into public.organization_members (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  return inv.organization_id;
end;
$$;

revoke all on function public.is_org_member(uuid), public.has_org_role(uuid, public.member_role[]),
  public.create_organization(text), public.create_invitation(uuid, text, public.member_role),
  public.accept_invitation(text) from public, anon;
grant execute on function public.is_org_member(uuid), public.has_org_role(uuid, public.member_role[]),
  public.create_organization(text), public.create_invitation(uuid, text, public.member_role),
  public.accept_invitation(text) to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;

-- No insert policy on organizations or organization_members: rows arrive only through the RPCs above.
revoke insert on public.organizations, public.organization_members from anon, authenticated;
revoke update on public.organization_members from anon, authenticated;
grant update (role) on public.organization_members to authenticated;
revoke insert, update on public.invitations from anon, authenticated;

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.member_role[]));

create policy members_select on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));
create policy members_update on public.organization_members for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  )
  with check (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  );
create policy members_delete on public.organization_members for delete to authenticated
  using (
    user_id = auth.uid()
    or public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  );

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
