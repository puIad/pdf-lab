-- Migration 2: RLS posture (MVP) — per docs/04-SCHEMA.md + docs/guides/supabase-pgvector.md.
--
-- Public read: markets, opportunities, competitors, evidence, sources
--   (anon can browse explorer within free-tier limits enforced app-side).
-- Private: users (owner only). Run-owned tables (research_runs, signals,
--   signal_analysis, market_signals) are service-role only in MVP;
--   service-role bypasses RLS, so enabling RLS with no anon policies
--   denies anon/authenticated while the server client keeps full access.
--   Tighten per-user in Phase 5.

-- Enable RLS on every table
alter table users enable row level security;
alter table research_runs enable row level security;
alter table sources enable row level security;
alter table signals enable row level security;
alter table signal_analysis enable row level security;
alter table markets enable row level security;
alter table market_signals enable row level security;
alter table opportunities enable row level security;
alter table competitors enable row level security;
alter table evidence enable row level security;

-- Public read policies (anon + authenticated)
create policy "public read sources"
  on sources for select to anon, authenticated using (true);

create policy "public read markets"
  on markets for select to anon, authenticated using (true);

create policy "public read opportunities"
  on opportunities for select to anon, authenticated using (true);

create policy "public read competitors"
  on competitors for select to anon, authenticated using (true);

create policy "public read evidence"
  on evidence for select to anon, authenticated using (true);

-- Owner-only users table (PK matches auth user id; no auth wired until Phase 5)
create policy "owner read/write users"
  on users for all to authenticated using (auth.uid() = id);

-- NOTE: research_runs, signals, signal_analysis, market_signals intentionally
-- have NO anon/authenticated policies in MVP: RLS denies them, service-role
-- (server-only key, never NEXT_PUBLIC_) performs all run reads/writes.
-- Phase 5 adds per-user policies alongside auth (see 04-SCHEMA.md).
