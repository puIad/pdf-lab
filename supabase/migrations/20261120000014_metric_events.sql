-- Migration 14: success-metrics events (Phase 6 Part 6.2, PRD §58 to §59, issue #31).
-- One row per thing a signed-in person did that says the product was useful. Counted actions
-- (searches, Deep runs) stay in usage_events; this table holds the signals the north-star metric
-- and its companions are read from.

create table metric_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  kind text not null check (kind in ('saved', 'useful_vote', 'new_market', 'research_to_creation', 'monitor_return')),
  subject_type text not null check (char_length(subject_type) between 1 and 40),  -- market | seed | idea | opportunity | brief
  subject_ref text not null check (char_length(subject_ref) between 1 and 200),
  value smallint,  -- useful_vote only: 1 useful, 0 not useful
  -- One row per fact: a person's vote on an opportunity, a day's return, a market's first sighting.
  -- Null for events that may repeat. Includes the user id, so it is unique across people too.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  check ((kind = 'useful_vote') = (value is not null))
);
create index on metric_events (kind, created_at);
create index on metric_events (user_id, created_at);

-- Service-role only, like usage_events: no grant and no policy for anon or authenticated.
alter table metric_events enable row level security;
revoke all on metric_events from anon, authenticated;
