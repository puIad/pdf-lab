-- Migration 17: takedown blocklist (issue #76, DEC-017).
-- A removed item must not be collected again. One row per blocked URL, keyed by the normalized URL
-- (`lib/takedown/takedown.ts`, normalizeUrlKey). Ingest and the competition check read it; only the
-- service role writes it, through `scripts/takedown.ts`.

create table takedowns (
  url_key text primary key check (char_length(url_key) between 1 and 2000),
  url text not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table takedowns enable row level security;
revoke all on takedowns from anon, authenticated;
