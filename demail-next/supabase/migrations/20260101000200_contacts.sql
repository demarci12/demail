-- Contacts and labels. Composite foreign keys keep every reference inside one organization.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  first_name text,
  last_name text,
  company text,
  phone text,
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  subscribed boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index contacts_org_email_idx on public.contacts (organization_id, lower(email));
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger contacts_org_immutable before update on public.contacts
  for each row execute function public.prevent_org_change();

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default '#0284c7',
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index labels_org_name_idx on public.labels (organization_id, lower(name));
create trigger labels_org_immutable before update on public.labels
  for each row execute function public.prevent_org_change();

create table public.contact_labels (
  contact_id uuid not null,
  label_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (contact_id, label_id),
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade,
  foreign key (label_id, organization_id) references public.labels (id, organization_id) on delete cascade
);
create index contact_labels_label_idx on public.contact_labels (label_id);

alter table public.contacts enable row level security;
alter table public.labels enable row level security;
alter table public.contact_labels enable row level security;

create policy contacts_select on public.contacts for select to authenticated
  using (public.is_org_member(organization_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy contacts_update on public.contacts for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy labels_select on public.labels for select to authenticated
  using (public.is_org_member(organization_id));
create policy labels_insert on public.labels for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy labels_update on public.labels for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy labels_delete on public.labels for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy contact_labels_select on public.contact_labels for select to authenticated
  using (public.is_org_member(organization_id));
create policy contact_labels_insert on public.contact_labels for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy contact_labels_delete on public.contact_labels for delete to authenticated
  using (public.is_org_member(organization_id));
