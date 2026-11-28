-- Hosted form display options: theme, focus mode and an optional https redirect after a successful submission.
alter table public.forms
  add column theme text not null default 'light' check (theme in ('light', 'dark', 'soft')),
  add column focus_mode boolean not null default false,
  add column redirect_url text check (redirect_url is null or (char_length(redirect_url) <= 500 and redirect_url ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'));
