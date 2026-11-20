-- Migration 19: scheduled monitoring (Phase 4 Part 4.2, DEC-001, DEC-010).
-- Three service-role tables. Nobody signs in to read them directly: the app reads them on the
-- server and shows a person only the seeds and markets they watch (lib/monitor/view.ts).

-- A dated snapshot of one seed's quick ideas in one region. Diffing two snapshots gives the `new`
-- and `history` trend bases. phrases: [{ "phrase", "demand", "opportunity", "trend" }].
create table seed_snapshots (
  id uuid primary key default gen_random_uuid(),
  seed text not null check (char_length(seed) between 2 and 80),   -- lowercased, single spaces
  region text not null,
  scanned_at timestamptz not null default now(),
  phrases jsonb not null default '[]',
  unique (seed, region, scanned_at)
);
create index seed_snapshots_seed_idx on seed_snapshots (seed, region, scanned_at desc);

-- The change report of one re-run of a watched seed (a monitor run) against the run before it.
create table change_reports (
  id uuid primary key default gen_random_uuid(),
  seed text not null,
  run_id uuid references research_runs(id) on delete cascade not null unique,
  baseline_run_id uuid references research_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  report jsonb not null
);
create index change_reports_seed_idx on change_reports (seed, created_at desc);

-- Scheduler state per job, for missed-run backoff (docs/PIPELINE-SCORING.md, "Scheduled monitoring").
-- key: 'seed|<region>|<seed>' or 'market|<seed>'.
create table monitor_jobs (
  key text primary key,
  last_ok_at timestamptz,
  failures int not null default 0,
  next_due_at timestamptz,
  last_error text
);

alter table seed_snapshots enable row level security;
alter table change_reports enable row level security;
alter table monitor_jobs enable row level security;
revoke all on seed_snapshots, change_reports, monitor_jobs from anon, authenticated;
