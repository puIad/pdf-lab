-- Migration 3: seed Tier-1 MVP sources (Phase 0 Part 0.2 task 4).
-- Adapter keys must match the registry introduced in Phase 1 Part 1.1.
-- Idempotent: safe to re-run (guarded by WHERE NOT EXISTS).

insert into sources (type, name, base_url, status)
select 'reddit', 'Reddit', 'https://www.reddit.com', 'active'
where not exists (select 1 from sources where type = 'reddit');

insert into sources (type, name, base_url, status)
select 'gtrends', 'Google Trends', 'https://trends.google.com', 'active'
where not exists (select 1 from sources where type = 'gtrends');

insert into sources (type, name, base_url, status)
select 'web', 'Web search', null, 'active'
where not exists (select 1 from sources where type = 'web');
