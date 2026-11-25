-- A/B variants of an email step; the step's own subject and body are variant A.
create table public.campaign_step_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  step_id uuid not null,
  label text not null check (label ~ '^[B-Z]$'),
  subject text not null check (char_length(btrim(subject)) between 1 and 500),
  body_plain text not null check (char_length(btrim(body_plain)) between 1 and 20000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (step_id, organization_id) references public.campaign_steps (id, organization_id) on delete cascade,
  unique (id, organization_id),
  unique (step_id, label)
);
create trigger campaign_step_variants_updated_at before update on public.campaign_step_variants
  for each row execute function public.set_updated_at();
create trigger campaign_step_variants_org_immutable before update on public.campaign_step_variants
  for each row execute function public.prevent_org_change();
alter table public.messages add column variant_id uuid;
alter table public.messages add constraint messages_variant_fk foreign key (variant_id, organization_id)
  references public.campaign_step_variants (id, organization_id) on delete set null (variant_id);
create index messages_variant_idx on public.messages (variant_id) where variant_id is not null;
alter table public.campaign_step_variants enable row level security;
create policy campaign_step_variants_select on public.campaign_step_variants for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_step_variants_insert on public.campaign_step_variants for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy campaign_step_variants_update on public.campaign_step_variants for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy campaign_step_variants_delete on public.campaign_step_variants for delete to authenticated
  using (public.is_org_member(organization_id));
