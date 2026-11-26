-- Links that let a client connect a Google or Microsoft mailbox into a workspace without an account; only the token's sha256 is stored.
create table public.mailbox_connect_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '' check (char_length(label) <= 80),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 50),
  uses integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (uses >= 0 and uses <= max_uses)
);
create index mailbox_connect_links_org_idx on public.mailbox_connect_links (organization_id);
create trigger mailbox_connect_links_org_immutable before update on public.mailbox_connect_links
  for each row execute function public.prevent_org_change();
create trigger mailbox_connect_links_label_insert before insert on public.mailbox_connect_links
  for each row execute function public.guard_display_name('label');
create trigger mailbox_connect_links_label_update before update of label on public.mailbox_connect_links
  for each row when (new.label is distinct from old.label) execute function public.guard_display_name('label');
alter table public.mailbox_connect_links enable row level security;
create policy mailbox_connect_links_select on public.mailbox_connect_links for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy mailbox_connect_links_delete on public.mailbox_connect_links for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.mailbox_connect_links from anon;
revoke insert, update on public.mailbox_connect_links from authenticated;
grant select, delete on public.mailbox_connect_links to authenticated;
grant all on public.mailbox_connect_links to service_role;
-- An owner or admin creates a link valid for 1 to 30 days, at most 20 unexpired per workspace.
create function public.create_connect_link(p_org uuid, p_label text, p_days integer, p_max_uses integer) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  raw text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not public.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 30 then
    raise exception 'a link is valid for 1 to 30 days' using errcode = 'P0001';
  end if;
  if (select count(*) from public.mailbox_connect_links l
      where l.organization_id = p_org and l.expires_at > now()) >= 20 then
    raise exception 'too many open connect links' using errcode = 'P0001';
  end if;
  insert into public.mailbox_connect_links (organization_id, token_hash, label, created_by, expires_at, max_uses)
  values (p_org, encode(sha256(convert_to(raw, 'utf8')), 'hex'), coalesce(btrim(p_label), ''), auth.uid(),
    now() + make_interval(days => p_days), p_max_uses);
  return raw;
end;
$$;
-- The open link behind a token, for the public connect page and the OAuth callback.
create function public.connect_link_lookup(p_token text)
returns table (id uuid, organization_id uuid, label text, created_by uuid, expires_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select l.id, l.organization_id, l.label, l.created_by, l.expires_at
  from public.mailbox_connect_links l
  where l.token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
    and l.expires_at > now() and l.uses < l.max_uses;
$$;
-- Takes one use atomically; false when the link expired or is used up.
create function public.consume_connect_link(p_id uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.mailbox_connect_links
  set uses = uses + 1, last_used_at = now()
  where id = p_id and uses < max_uses and expires_at > now();
  return found;
end;
$$;
revoke all on function public.create_connect_link(uuid, text, integer, integer) from public, anon;
grant execute on function public.create_connect_link(uuid, text, integer, integer) to authenticated, service_role;
revoke all on function public.connect_link_lookup(text), public.consume_connect_link(uuid) from public, anon, authenticated;
grant execute on function public.connect_link_lookup(text), public.consume_connect_link(uuid) to service_role;
