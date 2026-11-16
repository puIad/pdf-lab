-- Migration 9: sign-in mirror + usage events (Phase 5 Part 5.1).

-- A person who signs in gets a public.users row with the id of their auth.users row.
-- plan defaults to 'free'; 'premium' is set by hand until billing exists (Part 5.3).
alter table users add constraint users_plan_check check (plan in ('free', 'premium'));

create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
-- Trigger-only: not callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- One row per counted action. A quota is the count of these rows inside a UTC day or month.
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  anon_hash text,          -- HMAC of a signed-out caller's IP address; the address itself is never stored
  kind text not null check (kind in ('search', 'exploration', 'check', 'deep')),
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (anon_hash is null))
);
create index on usage_events (user_id, kind, created_at);
create index on usage_events (anon_hash, kind, created_at);

-- Service-role only, like research_runs (no anon/authenticated policy).
alter table usage_events enable row level security;
