-- Migration 10: watchlist (Phase 4 Part 4.1, DEC-010 item 17).
-- One row per thing a signed-in person follows: a stored market, a quick-ideas seed in a region,
-- or a single idea (a search phrase) saved from a scan.

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  kind text not null check (kind in ('market', 'seed', 'idea')),
  ref text not null check (char_length(ref) between 1 and 200),  -- market id, seed, or idea phrase
  region text not null default '',  -- scan region for a seed or idea; '' for a market (a null would not be unique)
  seed text check (char_length(seed) <= 80),  -- idea only: the scan it was saved from
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref, region)
);

-- Owner only. A grant decides whether a role may touch the table, a policy which rows: both are
-- set, because adding policies does not take the default grants back.
alter table watchlists enable row level security;
revoke all on watchlists from anon, authenticated;
grant select, insert, delete on watchlists to authenticated;

create policy "owner reads watchlist"
  on watchlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner adds to watchlist"
  on watchlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner removes from watchlist"
  on watchlists for delete to authenticated using ((select auth.uid()) = user_id);
