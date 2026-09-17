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
- Resolution: _resolved 2026-09-17 in Phase 1 Part 1.2_ — picked **Serper** (`SERPER_API_KEY`, endpoint `POST https://google.serper.dev/search`). Live pricing verified 2026-09-17 via web search: **Serper** = 2,500 free credits, no credit card, PAYG ~$1/1K down to ~$0.30/1K at volume, raw Google SERP JSON (URL+title+snippet+date — exactly the adapter's needs); **Brave** = $5/mo credit (~1,000 reqs) then $5/1K, requires credit card + site attribution, true free tier closed Feb 2026; **Tavily** = 1,000 free/mo then $0.008/query ($8/1K basic) — best-shaped (LLM answers/extraction) but 8–27× pricier, extraction is a Phase-2 concern not MVP ingest; **Bing API** = dead (retired summer 2025). Serper wins on largest true free tier + no card + cheapest overage + direct shape match. No cost incurred this part: adapter degrades honestly (`skipped`, no filler) until a key lands; live web proof via Composio-search dev harness through `WebAdapter.normalize()` (same DEC-006 pattern, zero repo dependency). Follow-up: user pastes `SERPER_API_KEY` (free, no card at https://serper.dev) into `.env.local` → prod path activates, zero code change. Guide `sources-reddit-trends-search.md` patched with the pick.
- Verification 2026-09-17: key installed in `.env.local` (git-ignored, never in repo). One-shot prod check with the real `WebAdapter`: `configured=true`, `healthCheck ok` (serper, ~1.7s), live `collect('pc troubleshooting', 5)` → 5 fresh rows inserted (all new URLs vs the harness rows — cross-provider URL dedup works). Temp script deleted after. Running dev servers need a restart to pick up the new env value.

## DEC-003 — Supabase project creation + keys needed to finish Part 0.2
- Date: 2026-09-16
- Part: Phase 0 Part 0.2
- Expected: Supabase free-tier project exists; URL + anon + service-role keys in env; migrations applied; RLS + embedding probes verified live.
- Found: No Supabase project exists yet (no `.env.local`, no `supabase/` dir before this part). All code-side work is complete and verified as far as possible locally: `supabase/migrations/*` (schema v1 verbatim per 04-SCHEMA + RLS + seed), `lib/db/client.ts` (browser/server/service), `/api/health` DB check; `pnpm lint`, `tsc --noEmit`, `pnpm build` green; `/api/health` returns `{"ok":true,"schemaVersion":1,"db":{"configured":false}}` with no env. Migrations + RLS + embedding/cosine probes verified against `pgvector/pgvector:pg16` on a fresh DB: 3 seed sources active, anon reads sources/markets, anon sees 0 rows on signals/runs/analysis, anon insert denied, cosine query returns nearest vector. Test container removed. Project creation itself needs a Supabase account — cannot be done by the agent.
- Options: (a) User creates the project at https://supabase.com/dashboard (free tier) and pastes the three values (URL, anon key, service-role key) — agent writes `.env.local` (git-ignored), applies migrations via SQL editor, re-runs live probes, commits; (b) User creates project AND applies `supabase/migrations/*` in order in the SQL editor, then pastes keys — agent verifies live and commits.
- Recommendation: (a) — fewer manual steps, agent does the verification.
- Question for user: "Create a free Supabase project and paste its URL + anon key + service-role key (Settings → API), or prefer to apply the migrations yourself?"
- Resolution: _resolved 2026-09-17_ — user granted Composio Supabase access instead of manual creation. Agent created project `pdf-lab` (ref `cjboiijclrwumgmgzvcl`, org VIC, region eu-west-3, free tier) via `SUPABASE_CREATE_A_PROJECT`, then applied the three local migrations in order as tracked migrations (`schema_v1`, `rls_mvp`, `seed_sources`). Live verification on the new project: 10/10 tables present; `vector` extension installed; RLS enabled on all 10 tables with exactly the 6 MVP policies (5 public-read + 1 owner-users, none on run-owned tables); embedding insert + `<=>` cosine probe returned dist 0 (probe rows removed after); 3 seed sources active; `.env.local` written (git-ignored, keys never in repo); `GET /api/health` → `{"ok":true,"schemaVersion":1,"db":{"configured":true,"sources":3}}`; `pnpm lint` + `pnpm build` green. DB password was generated at creation time and handed to the user in chat (not retrievable via API, not stored in repo). No guide patch needed — SQL surface matched `guides/supabase-pgvector.md`.

## DEC-004 — Reddit unauthenticated search is dead; OAuth creds needed for live ingest
- Date: 2026-09-17
- Part: Phase 1 Part 1.1
- Expected: `docs/guides/sources-reddit-trends-search.md` — authenticated OAuth preferred, anonymous public search JSON as zero-credential fallback; acceptance = live `pc troubleshooting` query stores 10 deduped `signals` rows (source `reddit`).
- Found: `GET https://www.reddit.com/search?q=pc+troubleshooting&limit=10&...&raw_json=1` with a descriptive `User-Agent` returns **HTTP 200 `text/html`** (login/block wall), not JSON — verified live twice via `RedditAdapter.collect()` (public-json fallback). Adapter now throws an explicit auth-mode error instead of parsing HTML; `healthCheck()` surfaces it honestly as `{ok:false}`. No ToS-gray workaround attempted (old.reddit endpoints, mirrors). Adapter code, registry, `/api/sources/health`, fixture + 11 unit tests (`pnpm test`), `pnpm lint`, `pnpm typecheck` are all done and green — only the live-DB acceptance is blocked.
- Options: (a) User creates a free Reddit app at https://www.reddit.com/prefs/apps (type **script**, redirect `http://localhost:8080`, free, ~2 min) and pastes **Client ID + Secret** — agent sets server-only `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` in `.env.local` (git-ignored), re-runs the live ingest via the already-implemented + unit-tested OAuth path, finishes the part. Fully ToS-clean, matches the guide's preferred mode, zero code change. (b) User supplies existing script/web-app creds — same handling as (a). (c) Mark 1.1 done on unit tests alone and defer live proof — NOT recommended: violates the part acceptance and evidence-before-synthesis. (d) Scrape fallbacks (old.reddit JSON, third-party mirrors) — NOT recommended: ToS-gray, against the guide's authenticated-first rule, would need its own §4c review.
- Recommendation: (a) — 2 minutes of user time, no code change, ToS-clean.
- Question for user: "Create a free Reddit app (type script) at reddit.com/prefs/apps and paste its Client ID + Client Secret so I can finish the live 10-row ingest — or prefer another path?"
- Resolution: _superseded 2026-09-17 by DEC-005 — self-service app creation is closed; see below._

## DEC-005 — Reddit closed self-service app creation (Responsible Builder Policy approval gate)
- Date: 2026-09-17
- Part: Phase 1 Part 1.1
- Expected: DEC-004 option (a) — user creates a free script app at https://www.reddit.com/prefs/apps in ~2 min, pastes Client ID + Secret.
- Found: `POST`/create at `/prefs/apps` no longer shows the form. It shows: "In order to create an application or use our API you can read our full policies here: https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy". Verified against live reports: since 2025-11-11 Reddit closed self-service Data API access (r/redditdev announcement + Data API Wiki May-2026 revision). New OAuth clients require explicit approval BEFORE any token is issued; existing apps unaffected. Unauthenticated traffic (incl. old `.json` trick) is now blocked — matches our DEC-004 probe (HTTP 200 text/html wall).
- Options: (a) Submit Reddit Data API approval request (free, ToS-clean, matches guide's authenticated-first rule). Start at Data API Wiki (https://www.reddit.com/r/reddit.com/wiki/api) → "contact us" form → "I'm a Developer" + "I want to register to use the Reddit API" → describe read-only non-commercial research use (10 req/min, OAuth, author-hash privacy, cache+backoff). Wait is weeks-to-never per r/redditdev reports; no code change; Part 1.1 stays blocked until approval lands. (b) Reuse an EXISTING approved app (pre-Nov-2025 script/web app owned by user) — same `.env.local` handling as DEC-004(a), instant unblock; policy explicitly preserves existing access. (c) Continue to Part 1.2 (Trends + web-search adapters) while approval pends; keep 1.1 code uncommitted/blocked, prove pipeline with 2 sources + honest completeness panel. No ToS risk, no waiting. (d) Paid licensed proxy (e.g. redditapis.com ~$0.002/read, Data365) — instant but violates near-zero-cost MVP + adds a new vendor behind the adapter; needs cost approval, NOT recommended for MVP. (e) Scrape fallbacks (old.reddit JSON, mirrors) — ToS-gray, violates 08-ADAPTERS rule 2, NOT recommended.
- Recommendation: (a)+(c) in parallel — submit the approval now (I can draft the 10-min ticket text), and let me continue 1.2 meanwhile so no weeks-long stall. If you happen to own a pre-Nov-2025 app, (b) beats everything — just paste those creds.
- Question for user: "Do you own a pre-Nov-2025 Reddit app (paste its creds), or shall I draft the approval ticket + continue to Part 1.2 on Trends/web while we wait?"
- Resolution: _resolved 2026-09-17 by DEC-006 — user directed Composio access instead._

## DEC-006 — Phase 1 Part 1.1 unblocked via Composio approved-OAuth dev harness (no prod dependency)
- Date: 2026-09-17
- Part: Phase 1 Part 1.1
- Expected: DEC-004(a)/DEC-005(a-b) — own Reddit script-app Client ID + Secret in `.env.local`, live ingest through `RedditAdapter.collect()` (app-only OAuth → `oauth.reddit.com`).
- Found: Self-service `/prefs/apps` creation is closed (Responsible Builder Policy approval gate, DEC-005). User answered "use the reddit access from complexio". Verified Composio toolkit `reddit` has ACTIVE connection (`reddit_trica-aloid`, user `AGLowWasTaken`, OAuth client `9rw5DA96UA4N0aHf3QP9xA`). `REDDIT_SEARCH_ACROSS_SUBREDDITS` (`pc troubleshooting`, limit 10, relevance) returned 10 live posts with `id/score/num_comments/created_utc/permalink` — same official API data, user-consented OAuth, ToS-clean.
- Options: (a) Dev-only harness (chosen) — map Composio post shape → `RedditPostData` → existing `RedditAdapter.normalize()` (sha256 authors, same row shape) → upsert `signals` via service-role REST. Zero repo prod dependency (no Composio SDK in `package.json`), zero code change to adapter, no secrets in repo, temp scripts live outside repo (`Temp/opencode`). (b) Composio-backed prod adapter — rejected for MVP: adds vendor dependency + per-call cost/limits, contradicts 03-STACK Tier-1 source spec. (c) Stay blocked waiting for Reddit approval — rejected per user direction.
- Recommendation: (a) — done this turn. Prod `collect()` still needs own app-id when approval lands (zero code change); `/api/sources/health` honestly keeps reporting anon-mode blocked until then.
- Question for user: "Composio harness accepted as 1.1 live proof so 1.2 can start — or require own app-id before marking done?"
- Resolution: _resolved 2026-09-17_ — live verification: 10 `signals` rows source `reddit` (`t3_1wa541j…t3_1724bsg`), `upsert 201`, rerun `409 duplicate` count stays 10 (DB `(source_id,external_id)` dedup proven); privacy probe `leaks:none`, all `author_hash=sha256:…`; `pnpm test` 11/11 green (fixed stub `listingResponse` missing `content-type: application/json` — Node defaults to `text/plain`, tripping the DEC-004 non-JSON guard); `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0 (`/api/sources/health` present). Follow-up: swap harness → own `REDDIT_CLIENT_ID/SECRET` when Reddit approves; no guide patch (OAuth surface unchanged).
