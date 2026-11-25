-- Extensions, enums and shared trigger functions.
create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('owner', 'admin', 'member');
create type public.mailbox_status as enum ('active', 'paused', 'disconnected');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed');
create type public.step_type as enum ('email', 'wait');
create type public.enrollment_status as enum ('active', 'completed', 'stopped', 'failed');
create type public.message_status as enum ('queued', 'sent', 'failed', 'skipped');

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Rows never move between organizations.
create function public.prevent_org_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable';
  end if;
  return new;
end;
$$;
