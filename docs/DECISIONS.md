# DECISIONS — decision-request log (problems stop here)

Append-only. Newest at the bottom. Every entry follows the template. Resolutions must also
patch the affected guide/phase file (link the follow-up commit).

## Template

```text
## DEC-XXX — <short title>
- Date:
- Part: Phase <N> Part <M>
- Expected: (what the docs said would happen)
- Found: (what actually happened — error text, version, link)
- Options: (a) ... (b) ... — with doc links + trade-offs
- Recommendation: (which option + why)
- Question for user: (the single sentence needing an answer)
- Resolution: (filled after answer + follow-up commit updating docs)
```

## DEC-001 — Jobs provider: Trigger.dev v4 vs Inngest vs cron (SEED — decide in Phase 4)

- Date: 2026-09-16
- Part: Phase 4 Part 4.2 (pre-seeded; do not decide earlier)
- Expected: MVP runs on route handlers + cron-pattern; scheduler choice deferred.
- Found: Pre-seed only. Trigger.dev verified v4 (`@trigger.dev/sdk` 4.x, durable tasks,
  cron, queues, idempotency keys — https://trigger.dev/docs). Inngest not re-verified
  (docs moved; check https://www.inngest.com/docs at decision time). Plain cron /
  Vercel Cron is the zero-dependency fallback.
- Options: (a) Trigger.dev v4 — durable, no timeouts, self-hostable (Apache-2.0 core);
  (b) Inngest — comparable, re-verify pricing/limits; (c) Vercel Cron + route handlers —
  simplest, platform timeout limits.
- Recommendation: none yet — measure Phase 1–3 run durations first; decide on data.
- Question for user: (to be asked in Phase 4) "Runs take ~X min and need Y retries — pick (a)/(b)/(c)?"
- Resolution: _unresolved_

## DEC-002 — Web-search provider pick (SEED — decide in Phase 1 Part 1.2)

- Date: 2026-09-16
- Part: Phase 1 Part 1.2 (pre-seeded)
- Expected: Exactly ONE free-tier search API behind the `web` adapter for MVP.
- Found: Candidates (Brave / Serper / Tavily / Bing) unverified — pricing changes fast.
- Options: compare free quota + ToS + snippet quality at build time; cheapest that returns
  URL+title+snippet+date wins for MVP.
- Recommendation: decide at Part 1.2 start with live pricing pages open.
- Question for user: (in Part 1.2) "Provider P free tier = X/mo — approve, or supply a key?"
- Resolution: _unresolved_

## DEC-003 — Supabase project creation + keys needed to finish Part 0.2
- Date: 2026-09-16
- Part: Phase 0 Part 0.2
- Expected: Supabase free-tier project exists; URL + anon + service-role keys in env; migrations applied; RLS + embedding probes verified live.
- Found: No Supabase project exists yet (no `.env.local`, no `supabase/` dir before this part). All code-side work is complete and verified as far as possible locally: `supabase/migrations/*` (schema v1 verbatim per 04-SCHEMA + RLS + seed), `lib/db/client.ts` (browser/server/service), `/api/health` DB check; `pnpm lint`, `tsc --noEmit`, `pnpm build` green; `/api/health` returns `{"ok":true,"schemaVersion":1,"db":{"configured":false}}` with no env. Migrations + RLS + embedding/cosine probes verified against `pgvector/pgvector:pg16` on a fresh DB: 3 seed sources active, anon reads sources/markets, anon sees 0 rows on signals/runs/analysis, anon insert denied, cosine query returns nearest vector. Test container removed. Project creation itself needs a Supabase account — cannot be done by the agent.
- Options: (a) User creates the project at https://supabase.com/dashboard (free tier) and pastes the three values (URL, anon key, service-role key) — agent writes `.env.local` (git-ignored), applies migrations via SQL editor, re-runs live probes, commits; (b) User creates project AND applies `supabase/migrations/*` in order in the SQL editor, then pastes keys — agent verifies live and commits.
- Recommendation: (a) — fewer manual steps, agent does the verification.
- Question for user: "Create a free Supabase project and paste its URL + anon key + service-role key (Settings → API), or prefer to apply the migrations yourself?"
- Resolution: _resolved 2026-09-17_ — user granted Composio Supabase access instead of manual creation. Agent created project `pdf-lab` (ref `cjboiijclrwumgmgzvcl`, org VIC, region eu-west-3, free tier) via `SUPABASE_CREATE_A_PROJECT`, then applied the three local migrations in order as tracked migrations (`schema_v1`, `rls_mvp`, `seed_sources`). Live verification on the new project: 10/10 tables present; `vector` extension installed; RLS enabled on all 10 tables with exactly the 6 MVP policies (5 public-read + 1 owner-users, none on run-owned tables); embedding insert + `<=>` cosine probe returned dist 0 (probe rows removed after); 3 seed sources active; `.env.local` written (git-ignored, keys never in repo); `GET /api/health` → `{"ok":true,"schemaVersion":1,"db":{"configured":true,"sources":3}}`; `pnpm lint` + `pnpm build` green. DB password was generated at creation time and handed to the user in chat (not retrievable via API, not stored in repo). No guide patch needed — SQL surface matched `guides/supabase-pgvector.md`.
