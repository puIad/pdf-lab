-- Migration 16: premium checkout stub and cost-per-run (Phase 5 Part 5.3, issue #29, PRD §34, §49).

-- One row per plan change. In stub mode source is 'stub' and no payment happened; a real provider
-- (a separate decision) adds its own source value later.
create table plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  from_plan text not null check (from_plan in ('free', 'premium')),
  to_plan text not null check (to_plan in ('free', 'premium')),
  source text not null check (source in ('stub')),
  charged_cents integer not null default 0 check (charged_cents = 0),  -- a stub never charges
  created_at timestamptz not null default now()
);
create index on plan_changes (user_id, created_at);

alter table plan_changes enable row level security;
revoke all on plan_changes from anon, authenticated;

-- The ledger summed per run since a date, for the cost dashboard and the limits copy. Service role only.
create or replace function ledger_run_costs(p_since timestamptz)
returns table (run_id uuid, mode text, calls bigint, total_tokens bigint, cost_usd numeric, unpriced_calls bigint)
language sql stable security invoker set search_path = public as $$
  select l.run_id, r.mode, count(*), sum(l.total_tokens)::bigint, sum(l.estimated_cost_usd),
         count(*) filter (where l.cost_basis = 'unpriced')
  from ai_usage_ledger l left join research_runs r on r.id = l.run_id
  where l.created_at >= p_since and l.run_id is not null
  group by l.run_id, r.mode
$$;
revoke all on function ledger_run_costs(timestamptz) from public, anon, authenticated;
grant execute on function ledger_run_costs(timestamptz) to service_role;
