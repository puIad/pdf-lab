-- Phase 3 Part 3.4: log planner rule-set version + structured plan per research run (PRD §26–§27).
alter table research_runs add column if not exists prompt_version text;
alter table research_runs add column if not exists plan jsonb;
