-- Form mail: per-form submission notifications and double opt-in. Both are off by default and send through a mailbox an owner or admin picks.
alter table public.form_submissions
  add constraint form_submissions_id_org_key unique (id, organization_id),
  add column optin_confirmed_at timestamptz;

alter table public.forms
  add column notify_enabled boolean not null default false,
  add column double_opt_in boolean not null default false,
  add column mail_mailbox_id uuid,
  add foreign key (mail_mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete set null (mail_mailbox_id);

-- Only owners and admins switch on mail that goes out under the workspace name; service-role writes (no auth.uid()) pass.
create function public.guard_form_mail_settings() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.notify_enabled or new.double_opt_in or new.mail_mailbox_id is not null))
    or (tg_op = 'UPDATE' and (
      new.notify_enabled is distinct from old.notify_enabled
      or new.double_opt_in is distinct from old.double_opt_in
      or (new.mail_mailbox_id is not null and new.mail_mailbox_id is distinct from old.mail_mailbox_id)
    )) then
    if not public.has_org_role(new.organization_id, array['owner', 'admin']::public.member_role[]) then
      raise exception 'Only owners and admins can change form mail settings' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger forms_guard_mail_settings before insert or update on public.forms
  for each row execute function public.guard_form_mail_settings();
revoke all on function public.guard_form_mail_settings() from public, anon, authenticated;

-- Members who get an email for each submission; leaving the workspace removes the row.
create table public.form_notify_recipients (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (form_id, user_id),
  foreign key (form_id, organization_id) references public.forms (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);
alter table public.form_notify_recipients enable row level security;
create policy form_notify_recipients_select on public.form_notify_recipients for select to authenticated
  using (public.is_org_member(organization_id));
create policy form_notify_recipients_insert on public.form_notify_recipients for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy form_notify_recipients_delete on public.form_notify_recipients for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke update on public.form_notify_recipients from anon, authenticated;
grant all on public.form_notify_recipients to service_role;

-- One row per double opt-in link. The link carries the id plus an HMAC; confirmed_at makes it single use.
create table public.form_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null,
  contact_id uuid not null,
  submission_id uuid not null,
  contact_was_pending boolean not null default false,
  expires_at timestamptz not null default now() + interval '72 hours',
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (form_id, organization_id) references public.forms (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade,
  foreign key (submission_id, organization_id) references public.form_submissions (id, organization_id) on delete cascade
);
create index form_confirmations_contact_idx on public.form_confirmations (form_id, contact_id, created_at desc);
alter table public.form_confirmations enable row level security;
revoke all on public.form_confirmations from anon, authenticated;
grant all on public.form_confirmations to service_role;

-- Outbox for form mail, drained by /api/cron/forms; the claim caps what a workspace sends per day.
create table public.form_mail_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null,
  submission_id uuid not null,
  kind text not null check (kind in ('confirm', 'notify')),
  confirmation_id uuid references public.form_confirmations (id) on delete cascade,
  recipient_user_id uuid,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'confirm') = (confirmation_id is not null)),
  check ((kind = 'notify') = (recipient_user_id is not null)),
  foreign key (form_id, organization_id) references public.forms (id, organization_id) on delete cascade,
  foreign key (submission_id, organization_id) references public.form_submissions (id, organization_id) on delete cascade
);
create index form_mail_jobs_due_idx on public.form_mail_jobs (next_attempt_at) where status = 'pending';
create index form_mail_jobs_form_idx on public.form_mail_jobs (form_id, kind, created_at desc);
create index form_mail_jobs_sent_idx on public.form_mail_jobs (organization_id, sent_at) where status = 'sent';
alter table public.form_mail_jobs enable row level security;
revoke all on public.form_mail_jobs from anon, authenticated;
grant all on public.form_mail_jobs to service_role;

-- Leases due jobs for 10 minutes; a workspace that sent 200 form mails in the last day waits.
create function public.claim_form_mail(batch integer) returns setof public.form_mail_jobs
language sql security definer
set search_path = ''
as $$
  with due as (
    select j.id
    from public.form_mail_jobs j
    where j.status = 'pending' and j.next_attempt_at <= now()
      and (
        select count(*) from public.form_mail_jobs s
        where s.organization_id = j.organization_id and s.status = 'sent' and s.sent_at > now() - interval '1 day'
      ) < 200
    order by j.next_attempt_at
    limit greatest(batch, 0)
    for update of j skip locked
  )
  update public.form_mail_jobs j
  set attempts = j.attempts + 1, next_attempt_at = now() + interval '10 minutes'
  from due
  where j.id = due.id
  returning j.*;
$$;
revoke all on function public.claim_form_mail(integer) from public, anon, authenticated;
grant execute on function public.claim_form_mail(integer) to service_role;
