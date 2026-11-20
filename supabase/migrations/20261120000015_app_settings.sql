-- Migration 15: app_settings (issue #25, Part 6.9, DEC-015).
-- Server-wide settings as key/value rows. The first key is `extraction_mode`: a chat model that
-- answered a test, or pasted replies. Service-role only: RLS on, no policy, no grant.
create table if not exists public.app_settings (
  key text primary key check (char_length(key) between 1 and 80),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
