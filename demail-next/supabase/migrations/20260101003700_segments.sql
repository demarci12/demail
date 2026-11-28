-- Saved segments: a typed rule document over contacts, an optional live link to a campaign, and one search function used by the contacts list.
create function public.segment_rules_valid(p_rules jsonb) returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(p_rules) = 'object'
    and p_rules ->> 'match' in ('all', 'any')
    and jsonb_typeof(p_rules -> 'conditions') = 'array'
    and jsonb_array_length(p_rules -> 'conditions') <= 10
    and not exists (
      select 1 from jsonb_array_elements(p_rules -> 'conditions') e
      where jsonb_typeof(e) <> 'object'
        or e ->> 'field' is null
        or e ->> 'field' not in ('email', 'first_name', 'last_name', 'company', 'phone', 'subscribed', 'label', 'created_at')
        or e ->> 'op' is null
        or e ->> 'op' not in ('contains', 'not_contains', 'equals', 'starts_with', 'is_empty', 'not_empty', 'is', 'has', 'not_has', 'before', 'after')
        or char_length(coalesce(e ->> 'value', '')) > 200
    );
$$;

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  rules jsonb not null default '{"match":"all","conditions":[]}'::jsonb check (public.segment_rules_valid(rules)),
  campaign_id uuid,
  live boolean not null default false,
  last_synced_at timestamptz,
  last_enrolled integer not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete set null (campaign_id)
);
create unique index segments_org_name_idx on public.segments (organization_id, lower(name));
create index segments_live_idx on public.segments (organization_id) where live;
create trigger segments_updated_at before update on public.segments
  for each row execute function public.set_updated_at();
create trigger segments_org_immutable before update on public.segments
  for each row execute function public.prevent_org_change();

alter table public.segments enable row level security;
create policy segments_select on public.segments for select to authenticated
  using (public.is_org_member(organization_id));
create policy segments_insert on public.segments for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy segments_update on public.segments for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy segments_delete on public.segments for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- One condition against one contact. Unknown fields and operators never match, and text values are matched literally.
create function public.contact_matches_condition(c public.contacts, cond jsonb) returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  f text := cond ->> 'field';
  o text := cond ->> 'op';
  v text := coalesce(cond ->> 'value', '');
  lit text := replace(replace(replace(v, '\', '\\'), '%', '\%'), '_', '\_');
  cell text;
begin
  if f in ('email', 'first_name', 'last_name', 'company', 'phone') then
    cell := case f when 'email' then c.email when 'first_name' then c.first_name when 'last_name' then c.last_name when 'company' then c.company else c.phone end;
    return case o
      when 'contains' then coalesce(cell, '') ilike '%' || lit || '%'
      when 'not_contains' then not (coalesce(cell, '') ilike '%' || lit || '%')
      when 'equals' then lower(coalesce(cell, '')) = lower(v)
      when 'starts_with' then coalesce(cell, '') ilike lit || '%'
      when 'is_empty' then btrim(coalesce(cell, '')) = ''
      when 'not_empty' then btrim(coalesce(cell, '')) <> ''
      else false
    end;
  elsif f = 'subscribed' then
    return o = 'is' and c.subscribed = (v = 'true');
  elsif f = 'label' then
    if o not in ('has', 'not_has') or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    return (o = 'has') = exists (
      select 1 from public.contact_labels cl
      where cl.contact_id = c.id and cl.organization_id = c.organization_id and cl.label_id = v::uuid
    );
  elsif f = 'created_at' then
    if v !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;
    return case o
      when 'before' then c.created_at < v::date
      when 'after' then c.created_at >= (v::date + 1)
      else false
    end;
  end if;
  return false;
end;
$$;

-- A rule document against one contact; null means no rule. An invalid document matches nobody.
create function public.contact_matches_rules(c public.contacts, p_rules jsonb) returns boolean
language sql
stable
set search_path = ''
as $$
  select p_rules is null or (
    public.segment_rules_valid(p_rules)
    and (
      (p_rules ->> 'match' = 'all' and not exists (select 1 from jsonb_array_elements(p_rules -> 'conditions') e where not public.contact_matches_condition(c, e)))
      or (p_rules ->> 'match' = 'any' and exists (select 1 from jsonb_array_elements(p_rules -> 'conditions') e where public.contact_matches_condition(c, e)))
    )
  );
$$;

-- Contacts of one organization that match two rule documents (null for none) and a free-text search, newest first.
create function public.contacts_search(p_org uuid, p_rules jsonb, p_extra jsonb, p_q text) returns setof public.contacts
language sql
stable
set search_path = ''
as $$
  select c.*
  from public.contacts c
  where c.organization_id = p_org
    and public.contact_matches_rules(c, p_rules)
    and public.contact_matches_rules(c, p_extra)
    and (
      coalesce(btrim(p_q), '') = ''
      or c.email ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or coalesce(c.first_name, '') ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or coalesce(c.last_name, '') ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or coalesce(c.company, '') ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by c.created_at desc, c.id;
$$;

-- Live links: enroll new matches of every live segment into its campaign. Runs from pg_cron, up to 5000 contacts per segment per tick.
create function public.sync_live_segments() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  ids uuid[];
  n integer;
  total integer := 0;
begin
  for s in
    select sg.* from public.segments sg
    join public.campaigns camp on camp.id = sg.campaign_id and camp.organization_id = sg.organization_id
    where sg.live and camp.status <> 'completed'
    order by sg.last_synced_at nulls first
    limit 50
  loop
    select coalesce(array_agg(m.id), '{}'::uuid[]) into ids
    from (
      select c.id from public.contacts_search(s.organization_id, s.rules, null, null) c
      where c.subscribed
        and not exists (select 1 from public.campaign_contacts cc where cc.campaign_id = s.campaign_id and cc.contact_id = c.id)
      limit 5000
    ) m;
    n := 0;
    if cardinality(ids) > 0 then
      n := public.enroll_contacts(s.campaign_id, ids);
    end if;
    update public.segments set last_synced_at = now(), last_enrolled = last_enrolled + n where id = s.id;
    total := total + n;
  end loop;
  return total;
end;
$$;

revoke all on function public.segment_rules_valid(jsonb), public.contact_matches_condition(public.contacts, jsonb), public.contact_matches_rules(public.contacts, jsonb),
  public.contacts_search(uuid, jsonb, jsonb, text), public.sync_live_segments() from public, anon;
grant execute on function public.segment_rules_valid(jsonb), public.contact_matches_condition(public.contacts, jsonb), public.contact_matches_rules(public.contacts, jsonb),
  public.contacts_search(uuid, jsonb, jsonb, text) to authenticated, service_role;
revoke all on function public.sync_live_segments() from authenticated;
grant execute on function public.sync_live_segments() to service_role;
