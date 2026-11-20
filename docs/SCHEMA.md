# DATA MODEL + SCHEMA (PRD §37, §12)

This is the normative schema. Migrations implement exactly this (naming kept snake_case as
in the PRD). Changes require a `DECISIONS.md` entry.

## Tables

```sql
-- Enable once per project
create extension if not exists vector;

-- Users & billing skeleton (Phase 5 fills plan/quotas; keep minimal now)
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now(),
  plan text not null default 'free'  -- anon handled app-side; values: free | premium
);

-- One row per research execution; drives the lifecycle in PIPELINE-SCORING.md
create table research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  query text not null,
  mode text not null default 'deep',  -- explore | validate | hunt | deep | monitor
  status text not null default 'queued',
  -- queued|collecting|normalizing|classifying|clustering|trend_analysis|
  -- competition_analysis|opportunity_generation|report_generation|completed|failed
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  prompt_version text,  -- planner rule-set version (Phase 3.4, migration 20260928000005)
  plan jsonb            -- structured NL query + mode + pipeline depth (PRD §26–§27)
);

-- One row per configured source (reddit, gtrends, web, etsy, gumroad, ...)
create table sources (
  id uuid primary key default gen_random_uuid(),
  type text not null,          -- adapter key, e.g. 'reddit'
  name text not null,
  base_url text,
  status text not null default 'active'
);

-- Normalized Market Signal (PRD §12). One row per collected item.
create table signals (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) not null,
  external_id text,            -- source-native id for dedup; unique per source
  url text,
  title text,
  content text,
  published_at timestamptz,
  engagement jsonb not null default '{}',  -- {upvotes, comments, ...} per source
  collected_at timestamptz not null default now(),
  unique (source_id, external_id)
);

-- AI extraction per signal (PRD §13–§14). Embedding dim MUST match AI-ROUTER.md.
create table signal_analysis (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade not null unique,
  audience text,
  problem text,
  intent text,                 -- weak|medium|strong|very_strong (+ raw label)
  urgency text,                -- low|medium|high
  pdf_relevance float,         -- 0..1
  prompt_version text,         -- extraction prompt that wrote the row (Part 6.9); null = extract-v1
  embedding vector(1536)       -- ADJUST to chosen embedding model; migration if changed
);
create index on signal_analysis using ivfflat (embedding vector_cosine_ops);

create table markets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references research_runs(id) on delete cascade,  -- null = legacy row (Part 6.7)
  name text not null,
  description text,
  trend text,                  -- emerging|accelerating|seasonal|stable|declining|unknown
  demand_score float,
  competition_score float,
  pdf_fit_score float,
  confidence float,            -- 0..1, always shown with score (PRD §54)
  created_at timestamptz not null default now()
);

create table market_signals (
  market_id uuid references markets(id) on delete cascade not null,
  signal_id uuid references signals(id) on delete cascade not null,
  relevance float,             -- 0..1
  primary key (market_id, signal_id)
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references research_runs(id) on delete cascade,  -- null = legacy row (Part 6.7)
  market_id uuid references markets(id) on delete cascade not null,
  title text not null,
  target_audience text,
  problem text,
  solution text,
  format text,                 -- checklist|guide|planner|workbook|template|...
  price_range text,
  opportunity_score float,
  matching_signals int,        -- market signals that match this problem (Part 6.8); null = not counted
  market_signal_count int,     -- of this many signals in the market at generation time
  confidence float not null,   -- REQUIRED, PRD §16: never show score without it
  created_at timestamptz not null default now()
);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references research_runs(id) on delete cascade,  -- null = legacy row (Part 6.7)
  market_id uuid references markets(id) on delete cascade,     -- null = overlaps no market of its run
  platform text,               -- etsy|gumroad|amazon_kdp|web|...
  title text,
  url text,
  price text,                  -- text: "$12", "free", "£9.99" — normalize app-side
  rating float,
  review_count int
);

-- Every claim links here (PRD §30). entity_type in market|opportunity|trend|competition.
create table evidence (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  source_id uuid references sources(id),
  claim text not null,
  excerpt text,
  url text,
  created_at timestamptz not null default now()
);
create index on evidence (entity_type, entity_id);

-- Which signals a run collected: new rows and rows it met again (Part 6.7). A run reads its
-- signals through this join, never a text match over `signals`.
create table run_signals (
  run_id uuid references research_runs(id) on delete cascade not null,
  signal_id uuid references signals(id) on delete cascade not null,
  primary key (run_id, signal_id)
);
create index on markets (run_id);
create index on opportunities (run_id);
create index on competitors (run_id);
```

## Run scope (Part 6.7, DEC-014)

- A Deep run writes its id on every `markets`, `opportunities` and `competitors` row it saves, and
  links the signals it collected in `run_signals`. A join table was chosen over a `run_id` column on
  `signals` because a signal is deduplicated across runs: two runs on the same seed meet the same
  rows, and each needs its own link.
- Rows from before the migration keep `run_id` null ("legacy"). Readers treat the latest completed
  Deep run of each seed (`research_runs.query`, case-insensitive) as current; an older run of the
  same seed is superseded and only shown when asked for by id (`lib/runs/scope.ts`).
- A competitor is saved on the market it was clustered into or overlaps best. Below the minimum
  overlap `market_id` stays null and the row belongs to the run only (`lib/competition/map.ts`).
  Its `evidence` row then uses the run id as `entity_id`.
- Migration: `supabase/migrations/20261113000006_run_scope.sql`.

## Sign-in and usage (Part 5.1)

```sql
alter table users add constraint users_plan_check check (plan in ('free', 'premium'));
-- trigger on auth.users insert: public.users row with the same id and email, plan 'free'
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  anon_hash text,          -- HMAC of a signed-out caller's IP; the address is never stored
  kind text not null check (kind in ('search', 'exploration', 'check', 'deep')),
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (anon_hash is null))
);
```

- One row per counted action. A quota is the count of rows in the current UTC day or month
  (`lib/quotas/quotas.ts`); a refused action writes no row. Service-role only, RLS on, no policy.
- The count and the insert are one step: `take_usage(user, anon_hash, kind, since, max)` takes an
  advisory lock per caller and kind, counts, and inserts only below `max`. Two requests at the
  limit cannot both pass. Service-role only.
- `public.users.id` equals `auth.users.id`. There is no foreign key between them, so a trigger on
  `auth.users` delete removes the `public.users` row. That cascades to the person's usage rows,
  watchlist and research runs (`research_runs.user_id` is `on delete cascade`; a run's markets,
  opportunities and competitors go with the run). Rows left by auth users deleted before the
  trigger existed are removed once by migration 12.
- Migrations: `supabase/migrations/20261116000009_auth_quotas.sql`,
  `20261116000011_atomic_limits.sql`, `20261117000012_orphan_users_cleanup.sql`.

## Watchlist (Part 4.1)

```sql
create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  kind text not null check (kind in ('market', 'seed', 'idea')),
  ref text not null check (char_length(ref) between 1 and 200),  -- market id, seed, or idea phrase
  region text not null default '',  -- scan region for a seed or idea; '' for a market
  seed text check (char_length(seed) <= 80),  -- idea only: the scan it was saved from
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref, region)
);
```

- One row per thing a signed-in person follows. Seeds and phrases are stored lowercased with
  single spaces (`lib/watchlist/watchlist.ts`), so the unique key is case-insensitive in practice.
- `region` is not nullable: two nulls would not collide in the unique key.
- Owner only, enforced twice: grants (`authenticated` may select and delete; `anon` nothing) and
  two policies on `(select auth.uid()) = user_id`. No update: a row is saved or removed. The app
  reads and removes rows as the signed-in person.
- Saving goes through `add_watch(user, kind, ref, region, seed, limit)`, service-role only. It
  locks per person, counts, and inserts only below `limit`, answering `added`, `exists` or `full`
  with the row count. A signed-in person cannot insert directly, so the cap cannot be passed.
- How many rows a plan holds is `WATCHLIST_LIMIT` in `lib/quotas/quotas.ts`, passed by
  `POST /api/watchlist`.
- Migrations: `supabase/migrations/20261116000010_watchlists.sql`,
  `20261116000011_atomic_limits.sql`.

## Success metrics (Part 6.2, PRD §58 to §59)

```sql
create table metric_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  kind text not null check (kind in ('saved', 'useful_vote', 'new_market', 'research_to_creation', 'monitor_return')),
  subject_type text not null,  -- market | seed | idea | opportunity | brief
  subject_ref text not null,
  value smallint,              -- useful_vote only: 1 useful, 0 not useful
  dedupe_key text unique,      -- one row per fact (a vote, a day's return, a first save); null may repeat
  created_at timestamptz not null default now()
);
```

- Service-role only, RLS on, no policy (like `usage_events`). Written by `lib/analytics/store.ts`;
  a failed write is logged and never fails the action it measures.
- Writers: `saved` in `POST /api/watchlist` when a row is added (first save only); `useful_vote` in
  `POST /api/metrics/vote` (a second vote replaces the first); `new_market` after a Deep run saves
  markets, for each whose exact name no earlier market has; `research_to_creation` in
  `POST /api/briefs/export` (signed in); `monitor_return` when a signed-in person opens
  `/watchlist`, one per day (re-scan monitoring is Part 4.2, so an open is the return signal until then).
- Claim-evidence coverage is computed, not stored: opportunities of the window with at least one
  evidence row naming a source and a url or excerpt, over all of them.
- North star, shown at `/admin/metrics`: validated opportunities (completed Deep run, sourced
  evidence, `completed_at` in the last 30 days) divided by active signed-in users (a `usage_events`
  or `metric_events` row in the window). No active user shows "Not observed". Searches are not in it.
- Migration: `supabase/migrations/20261120000013_metric_events.sql`.

## RLS (Supabase)

- Public read: `markets`, `opportunities`, `competitors`, `evidence`, `sources` (anon can
  browse explorer within free-tier limits enforced app-side).
- Private: `users` (owner only), `watchlists` (owner only, Part 4.1), `research_runs` + `signals`/`signal_analysis`/
  `market_signals`/`run_signals` (owner's runs + linked rows, or service-role only in MVP; tighten in Phase 5).
- Enforce with policies + tests in Phase 0 Part 0.2; service-role key NEVER ships to client.

## Invariants

1. `opportunities.confidence` NOT NULL — a score without confidence is a schema violation.
2. `(source_id, external_id)` unique on `signals` — dedup at the DB, not just in code.
3. `signal_analysis.signal_id` unique — one extraction row per signal (re-runs UPDATE).
4. Every score shown in UI joins to countable `evidence` rows (see `EVIDENCE-CONTRACT.md`).
