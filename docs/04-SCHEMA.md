# 04 — DATA MODEL + SCHEMA (PRD §37, §12)

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

-- One row per research execution; drives the lifecycle in 05-PIPELINE-SCORING.md
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

-- AI extraction per signal (PRD §13–§14). Embedding dim MUST match 07-AI-ROUTER.md.
create table signal_analysis (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid references signals(id) on delete cascade not null unique,
  audience text,
  problem text,
  intent text,                 -- weak|medium|strong|very_strong (+ raw label)
  urgency text,                -- low|medium|high
  pdf_relevance float,         -- 0..1
  embedding vector(1536)       -- ADJUST to chosen embedding model; migration if changed
);
create index on signal_analysis using ivfflat (embedding vector_cosine_ops);

create table markets (
  id uuid primary key default gen_random_uuid(),
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
  market_id uuid references markets(id) on delete cascade not null,
  title text not null,
  target_audience text,
  problem text,
  solution text,
  format text,                 -- checklist|guide|planner|workbook|template|...
  price_range text,
  opportunity_score float,
  confidence float not null,   -- REQUIRED, PRD §16: never show score without it
  created_at timestamptz not null default now()
);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references markets(id) on delete cascade not null,
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
```

## RLS (Supabase)

- Public read: `markets`, `opportunities`, `competitors`, `evidence`, `sources` (anon can
  browse explorer within free-tier limits enforced app-side).
- Private: `users` (owner only), `research_runs` + `signals`/`signal_analysis`/
  `market_signals` (owner's runs + linked rows, or service-role only in MVP; tighten in Phase 5).
- Enforce with policies + tests in Phase 0 Part 0.2; service-role key NEVER ships to client.

## Invariants

1. `opportunities.confidence` NOT NULL — a score without confidence is a schema violation.
2. `(source_id, external_id)` unique on `signals` — dedup at the DB, not just in code.
3. `signal_analysis.signal_id` unique — one extraction row per signal (re-runs UPDATE).
4. Every score shown in UI joins to countable `evidence` rows (see `06-EVIDENCE-CONTRACT.md`).
