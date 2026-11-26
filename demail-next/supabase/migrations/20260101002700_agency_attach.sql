-- Single-use links an agency sends to the owner of an existing workspace; only the token's sha256 is stored.
create table public.agency_attach_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at timestamptz not null,
  accepted_org uuid references public.organizations (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index agency_attach_invites_org_idx on public.agency_attach_invites (organization_id);
alter table public.agency_attach_invites enable row level security;
create policy agency_attach_invites_select on public.agency_attach_invites for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy agency_attach_invites_delete on public.agency_attach_invites for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.agency_attach_invites from anon;
revoke insert, update on public.agency_attach_invites from authenticated;
grant select, delete on public.agency_attach_invites to authenticated;
grant all on public.agency_attach_invites to service_role;

-- One level only, a workspace joins an agency at creation or through accept_agency_attach, and agency mode stays on while clients exist.
create or replace function public.guard_agency_fields() returns trigger
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
    if new.agency_id is not null and new.agency_id is distinct from old.agency_id
      and (old.agency_id is not null or coalesce(current_setting('demail.attach_org', true), '') <> new.id::text) then
      raise exception 'a workspace joins an agency only when the agency creates it or its owner accepts an invitation';
    end if;
    if old.is_agency and not new.is_agency and exists (select 1 from public.organizations c where c.agency_id = new.id) then
      raise exception 'release every client workspace before turning agency mode off';
    end if;
  end if;
  return new;
end;
$$;

-- An agency owner or admin creates an invitation link valid for 7 days, at most 20 open at a time.
create function public.create_agency_attach_invite(p_agency uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  raw text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not public.has_org_role(p_agency, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations a where a.id = p_agency and a.is_agency) then
    raise exception 'not an agency workspace' using errcode = '42501';
  end if;
  if (select count(*) from public.agency_attach_invites i
      where i.organization_id = p_agency and i.accepted_at is null and i.expires_at > now()) >= 20 then
    raise exception 'too many open invitations' using errcode = 'P0001';
  end if;
  insert into public.agency_attach_invites (organization_id, token_hash, created_by, expires_at)
  values (p_agency, encode(sha256(convert_to(raw, 'utf8')), 'hex'), auth.uid(), now() + interval '7 days');
  return raw;
end;
$$;

-- The agency behind an open invitation, for a signed-in caller holding its token.
create function public.agency_attach_preview(p_token text)
returns table (agency_id uuid, agency_name text, expires_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select a.id, a.name, i.expires_at
  from public.agency_attach_invites i
  join public.organizations a on a.id = i.organization_id
  where auth.uid() is not null
    and i.token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    and i.accepted_at is null and i.expires_at > now();
$$;

-- A direct owner of a plain workspace accepts; the only path that sets agency_id on an existing workspace.
create function public.accept_agency_attach(p_token text, p_org uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  inv public.agency_attach_invites;
  target public.organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into inv from public.agency_attach_invites
  where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
  for update;
  if not found or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'invitation is invalid or expired' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into target from public.organizations where id = p_org for update;
  if not found or target.agency_id is not null or target.is_agency or target.id = inv.organization_id then
    raise exception 'this workspace cannot join an agency' using errcode = 'P0001';
  end if;
  perform set_config('demail.attach_org', p_org::text, true);
  update public.organizations set agency_id = inv.organization_id where id = p_org;
  perform set_config('demail.attach_org', '', true);
  update public.agency_attach_invites
  set accepted_org = p_org, accepted_by = auth.uid(), accepted_at = now()
  where id = inv.id;
  return inv.organization_id;
end;
$$;

revoke all on function public.create_agency_attach_invite(uuid), public.agency_attach_preview(text),
  public.accept_agency_attach(text, uuid) from public, anon;
grant execute on function public.create_agency_attach_invite(uuid), public.agency_attach_preview(text),
  public.accept_agency_attach(text, uuid) to authenticated, service_role;
