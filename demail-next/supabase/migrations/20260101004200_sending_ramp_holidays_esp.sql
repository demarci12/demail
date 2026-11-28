-- Cold-send ramp-up per mailbox, holiday skipping and ESP matching per campaign. All additive; the previous release ignores the new columns.
-- Existing mailboxes keep their behaviour (ramp off). New rows default to ramp on, and the trigger stamps the start so an old release inserting a mailbox still ramps.
alter table public.mailboxes
  add column ramp_enabled boolean not null default false,
  add column ramp_start integer not null default 10 check (ramp_start between 1 and 5000),
  add column ramp_step integer not null default 5 check (ramp_step between 0 and 5000),
  add column ramp_started_at timestamptz;
alter table public.mailboxes alter column ramp_enabled set default true;

create function public.stamp_mailbox_ramp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ramp_enabled and new.ramp_started_at is null then
    new.ramp_started_at := now();
  end if;
  return new;
end;
$$;
create trigger mailboxes_stamp_ramp before insert or update of ramp_enabled on public.mailboxes
  for each row execute function public.stamp_mailbox_ramp();

alter table public.campaigns
  add column skip_holidays boolean not null default false,
  add column esp_matching boolean not null default false;

-- Mail host of a recipient domain, looked up through MX records and cached. Instance-wide, not workspace data: RLS on with no policy, so only the service role reads or writes it.
create table public.recipient_hosts (
  domain text primary key check (domain = lower(domain) and length(domain) between 3 and 253),
  esp text not null check (esp in ('google', 'microsoft', 'other')),
  checked_at timestamptz not null default now()
);
alter table public.recipient_hosts enable row level security;
revoke all on public.recipient_hosts from anon, authenticated;
grant select, insert, update, delete on public.recipient_hosts to service_role;
