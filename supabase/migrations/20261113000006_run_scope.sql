-- Phase 6 Part 6.7 (DEC-014): scope a Deep run's output to the run.
-- Legacy rows keep run_id null. Deleting a run deletes what it produced.
alter table markets add column if not exists run_id uuid references research_runs(id) on delete cascade;
alter table opportunities add column if not exists run_id uuid references research_runs(id) on delete cascade;
alter table competitors add column if not exists run_id uuid references research_runs(id) on delete cascade;
create index if not exists markets_run_id_idx on markets (run_id);
create index if not exists opportunities_run_id_idx on opportunities (run_id);
create index if not exists competitors_run_id_idx on competitors (run_id);

-- A competitor that overlaps no market of its run stays attached to the run only.
alter table competitors alter column market_id drop not null;

-- Which signals a run collected (fresh inserts and rows it met again). A run works on these,
-- never on a text match over the whole signals table.
create table if not exists run_signals (
  run_id uuid references research_runs(id) on delete cascade not null,
  signal_id uuid references signals(id) on delete cascade not null,
  primary key (run_id, signal_id)
);
-- Service-role only, like research_runs and signals (no anon/authenticated policy).
alter table run_signals enable row level security;
