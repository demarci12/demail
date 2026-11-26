-- Workspace and brand names reach other workspaces, so every write that sets or changes one is checked here.
create function public.is_display_name(p text) returns boolean
language sql immutable
set search_path = ''
as $$
  select p is not null
    and p !~ '[\x01-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff<>@]'
    and strpos(lower(p), '://') = 0
    and strpos(lower(p), 'www.') = 0;
$$;
-- Checks the column named by the trigger argument: no control, invisible or bidi characters, tags, links or addresses.
create function public.guard_display_name() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_display_name(to_jsonb(new) ->> tg_argv[0]) then
    raise exception 'names cannot contain control, invisible or direction characters, tags, links or addresses'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
-- Fires only when a name is set or changed, so rows written earlier keep working until their name is edited.
create trigger organizations_display_name_insert before insert on public.organizations
  for each row execute function public.guard_display_name('name');
create trigger organizations_display_name_update before update of name on public.organizations
  for each row when (new.name is distinct from old.name) execute function public.guard_display_name('name');
create trigger org_branding_display_name_insert before insert on public.org_branding
  for each row execute function public.guard_display_name('brand_name');
create trigger org_branding_display_name_update before update of brand_name on public.org_branding
  for each row when (new.brand_name is distinct from old.brand_name) execute function public.guard_display_name('brand_name');
revoke all on function public.guard_display_name() from public, anon, authenticated;
