-- Migration 20: in-app alerts (Phase 4 Part 4.3, PRD §45, DEC-010). No email, no push: the app
-- only writes rows that the alert feed reads.

-- A person's alert settings for one watch (a seed or a market). No row = defaults (not muted,
-- default threshold). Deleted with the watch.
create table alert_settings (
  watch_id uuid primary key references watchlists(id) on delete cascade,
  user_id uuid references users(id) on delete cascade not null,
  threshold int check (threshold between 1 and 100),  -- seed: opportunity score; market: new buyer-intent signals; null = default
  muted boolean not null default false,
  updated_at timestamptz not null default now()
);

-- One row per threshold crossing. `dedupe` makes a repeated cron call write it once.
create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  watch_id uuid references watchlists(id) on delete cascade not null,
  kind text not null check (kind in ('opportunity', 'market_change')),
  seed text not null,
  region text not null default '',
  title text not null,
  detail jsonb not null default '{}',   -- the dated evidence: phrase, scores, both scan dates / the report run
  dedupe text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe)
);
create index alerts_user_idx on alerts (user_id, created_at desc);

-- Owner reads their own rows; every write goes through the service role (the cron and the API).
alter table alert_settings enable row level security;
alter table alerts enable row level security;
revoke all on alert_settings, alerts from anon, authenticated;
grant select on alert_settings, alerts to authenticated;
create policy "owner reads alert settings" on alert_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner reads alerts" on alerts for select to authenticated using ((select auth.uid()) = user_id);
