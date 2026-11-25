-- Campaigns, steps, sender pool, enrollments and the message log.
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  status public.campaign_status not null default 'draft',
  stop_on_reply boolean not null default true,
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  timezone text not null default 'UTC',
  -- Bitmask of send days: bit 0 = Sunday ... bit 6 = Saturday. 62 = Monday to Friday.
  send_days smallint not null default 62 check (send_days between 0 and 127),
  send_start time not null default '08:00',
  send_end time not null default '18:00',
  unsubscribe_header boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (send_end > send_start),
  unique (id, organization_id)
);
create index campaigns_org_idx on public.campaigns (organization_id, status);
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger campaigns_org_immutable before update on public.campaigns
  for each row execute function public.prevent_org_change();

create table public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  position integer not null check (position >= 0),
  type public.step_type not null,
  name text,
  subject text,
  body_plain text,
  body_html text,
  wait_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  unique (id, organization_id),
  -- Deferred so steps can be reordered inside one transaction.
  unique (campaign_id, position) deferrable initially deferred,
  check (
    (type = 'email'
      and char_length(btrim(coalesce(subject, ''))) > 0
      and char_length(btrim(coalesce(body_plain, ''))) > 0)
    or (type = 'wait' and wait_seconds is not null and wait_seconds > 0)
  )
);
create trigger campaign_steps_updated_at before update on public.campaign_steps
  for each row execute function public.set_updated_at();
create trigger campaign_steps_org_immutable before update on public.campaign_steps
  for each row execute function public.prevent_org_change();

create table public.campaign_mailboxes (
  campaign_id uuid not null,
  mailbox_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (campaign_id, mailbox_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);

create table public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  contact_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status public.enrollment_status not null default 'active',
  current_step integer not null default 0 check (current_step >= 0),
  next_send_at timestamptz,
  last_sent_at timestamptz,
  mailbox_id uuid,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade,
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete set null (mailbox_id),
  unique (id, organization_id),
  unique (campaign_id, contact_id)
);
create index campaign_contacts_due_idx on public.campaign_contacts (status, next_send_at);
create index campaign_contacts_contact_idx on public.campaign_contacts (contact_id);
create trigger campaign_contacts_updated_at before update on public.campaign_contacts
  for each row execute function public.set_updated_at();
create trigger campaign_contacts_org_immutable before update on public.campaign_contacts
  for each row execute function public.prevent_org_change();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null,
  contact_id uuid not null,
  step_id uuid,
  mailbox_id uuid,
  status public.message_status not null default 'queued',
  resend_id text,
  idempotency_key text not null unique,
  subject text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade,
  foreign key (step_id, organization_id) references public.campaign_steps (id, organization_id) on delete set null (step_id),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete set null (mailbox_id)
);
create index messages_mailbox_sent_idx on public.messages (mailbox_id, sent_at);
create index messages_campaign_idx on public.messages (campaign_id, created_at desc);
create index messages_contact_idx on public.messages (contact_id);

alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_mailboxes enable row level security;
alter table public.campaign_contacts enable row level security;
alter table public.messages enable row level security;

create policy campaigns_select on public.campaigns for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy campaign_steps_select on public.campaign_steps for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_steps_insert on public.campaign_steps for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy campaign_steps_update on public.campaign_steps for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy campaign_steps_delete on public.campaign_steps for delete to authenticated
  using (public.is_org_member(organization_id));

create policy campaign_mailboxes_select on public.campaign_mailboxes for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_mailboxes_insert on public.campaign_mailboxes for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy campaign_mailboxes_delete on public.campaign_mailboxes for delete to authenticated
  using (public.is_org_member(organization_id));

create policy campaign_contacts_select on public.campaign_contacts for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_contacts_insert on public.campaign_contacts for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy campaign_contacts_update on public.campaign_contacts for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy campaign_contacts_delete on public.campaign_contacts for delete to authenticated
  using (public.is_org_member(organization_id));

-- Messages are written by the service role only.
create policy messages_select on public.messages for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.messages from anon, authenticated;
