# GUIDE — Supabase Postgres + pgvector + RLS (verified root 2026-09-16)

Sources: https://supabase.com/docs (AI → vector embeddings guides).
⚠️ Guide slugs under `/docs/guides/ai/*` MOVED during 2026 — resolve the live slug at
Phase 0 Part 0.2 via the docs search/llms index. If the SQL surface differs, file a
decision request; do not improvise.

## Stable core (what to rely on)

```sql
create extension if not exists vector;
-- signal_analysis.embedding vector(<DIM>)  -- DIM = embed model dim (default plan: 1536;
--   MUST match 07-AI-ROUTER.md; changing models = migration + backfill)
create index on signal_analysis using ivfflat (embedding vector_cosine_ops);
```

Full DDL lives in `docs/04-SCHEMA.md` — migrations implement it verbatim.

## Client wiring (Next.js)

- `lib/db/client.ts`: three clients — browser (anon), server (anon, cookies), service
  (service-role, server-only, NEVER `NEXT_PUBLIC_`, never imported by client components).
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public),
  `SUPABASE_SERVICE_ROLE_KEY` (server-only, Vercel dashboard + local `.env.local`).

## RLS posture (MVP → Phase 5)

- Public read: markets, opportunities, competitors, evidence, sources.
- Owner-only: users; run-owned tables via service role in MVP, tightened per-user in Phase 5.
- Verify in Part 0.2 with anon-vs-service query probes (record outputs in the PR/commit).

## pgvector ops notes

- `ivfflat` index needs data before planning is effective; small MVP tables can seq-scan —
  fine. Revisit index + `lists` tuning when signals exceed ~50k rows (Phase 4 note).
- Cosine (`<=>`) is the default similarity for clustering/dedup (Phase 1 Part 1.4).
