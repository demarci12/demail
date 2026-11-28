-- File fields on hosted forms. Files live in a private Storage bucket; members get short-lived signed links, nothing is public.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('form-files', 'form-files', false, 3000000, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'])
    on conflict (id) do nothing;
  end if;
end;
$$;

create table public.form_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null,
  submission_id uuid not null,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  storage_path text not null unique check (char_length(storage_path) between 10 and 200),
  original_name text not null check (char_length(original_name) between 1 and 100),
  content_type text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain')),
  size_bytes integer not null check (size_bytes between 1 and 3000000),
  status text not null default 'pending' check (status in ('pending', 'stored', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (form_id, organization_id) references public.forms (id, organization_id) on delete cascade,
  foreign key (submission_id, organization_id) references public.form_submissions (id, organization_id) on delete cascade
);
create index form_files_submission_idx on public.form_files (submission_id);
create index form_files_form_idx on public.form_files (form_id, created_at desc);
create index form_files_org_idx on public.form_files (organization_id, created_at desc);
alter table public.form_files enable row level security;
create policy form_files_select on public.form_files for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.form_files from anon, authenticated;
grant all on public.form_files to service_role;

-- Deleting a submission, contact, form or workspace removes its rows; this queue lets the cron job remove the bytes too.
create table public.form_file_deletions (
  id bigint generated always as identity primary key,
  storage_path text not null,
  created_at timestamptz not null default now()
);
alter table public.form_file_deletions enable row level security;
revoke all on public.form_file_deletions from anon, authenticated;
grant all on public.form_file_deletions to service_role;

create function public.queue_form_file_deletion() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.form_file_deletions (storage_path) values (old.storage_path);
  return old;
end;
$$;
create trigger form_files_queue_deletion after delete on public.form_files
  for each row execute function public.queue_form_file_deletion();
revoke all on function public.queue_form_file_deletion() from public, anon, authenticated;
