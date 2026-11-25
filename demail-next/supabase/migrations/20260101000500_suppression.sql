-- Suppression list. Inserting an address also unsubscribes the matching contact.
create table public.suppressed_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  reason text,
  source text not null default 'manual' check (source in ('unsubscribe', 'bounce', 'complaint', 'manual', 'import')),
  campaign_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete set null (campaign_id)
);
create unique index suppressed_org_email_idx on public.suppressed_recipients (organization_id, lower(email));
create trigger suppressed_org_immutable before update on public.suppressed_recipients
  for each row execute function public.prevent_org_change();

create function public.suppress_matching_contacts() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.contacts set subscribed = false
  where organization_id = new.organization_id and lower(email) = lower(new.email) and subscribed;
  return new;
end;
$$;
create trigger suppressed_recipients_unsubscribe after insert on public.suppressed_recipients
  for each row execute function public.suppress_matching_contacts();

alter table public.suppressed_recipients enable row level security;

create policy suppressed_select on public.suppressed_recipients for select to authenticated
  using (public.is_org_member(organization_id));
create policy suppressed_insert on public.suppressed_recipients for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy suppressed_delete on public.suppressed_recipients for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
