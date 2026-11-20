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

-- ledger_run_costs filters on created_at alone; the existing (user_id, created_at) index cannot serve it.
create index on ai_usage_ledger (created_at);

-- The plan flip and its log row are one transaction: an RPC call runs as one statement's transaction,
-- so a failed insert rolls the users update back and no unlogged plan change survives a retry.
-- Service role only, like take_usage. Returns the plan_changes id.
create function public.stub_change_plan(p_user uuid, p_from text, p_to text)
  returns uuid
  language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  update public.users set plan = p_to where id = p_user;
  if not found then
    raise exception 'stub_change_plan: no user %', p_user;
  end if;
  insert into public.plan_changes (user_id, from_plan, to_plan, source, charged_cents)
    values (p_user, p_from, p_to, 'stub', 0)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.stub_change_plan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.stub_change_plan(uuid, text, text) to service_role;
