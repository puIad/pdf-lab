-- Migration 4: seed Tier-2 marketplace sources (Phase 2 Part 2.3).
-- Adapter keys match registry: etsy, gumroad, kdp.
-- Idempotent: safe to re-run (guarded by WHERE NOT EXISTS).

insert into sources (type, name, base_url, status)
select 'etsy', 'Etsy', 'https://www.etsy.com', 'active'
where not exists (select 1 from sources where type = 'etsy');

insert into sources (type, name, base_url, status)
select 'gumroad', 'Gumroad', 'https://gumroad.com', 'active'
where not exists (select 1 from sources where type = 'gumroad');

insert into sources (type, name, base_url, status)
select 'kdp', 'Amazon KDP', 'https://kdp.amazon.com', 'active'
where not exists (select 1 from sources where type = 'kdp');
