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

## DEC-007 — Tier-2 marketplace adapters (Etsy, Gumroad, Amazon KDP) approach
- Date: 2026-09-20
- Part: Phase 2 Part 2.3
- Expected: Tier-2 adapters for Etsy, Gumroad, and Amazon KDP behind the SourceAdapter interface (08-ADAPTERS.md). ToS-checked; web-search-backed where official public search APIs are absent; log approach per source in DECISIONS per §4c.
- Found:
  1. Etsy: Etsy Open API v3 requires full commercial developer application, per-user OAuth2 token, and restricted access. Direct unauthenticated scraping of Etsy violates Etsy Terms of Use §3 and is guarded by Cloudflare anti-bot walls.
  2. Gumroad: Gumroad API (`/v2/products`) only exposes the authenticated seller's own inventory, not a public marketplace-wide discovery search endpoint.
  3. Amazon KDP: Amazon Product Advertising API (PA-API) requires an active affiliate account with 3 qualifying sales within 180 days (or keys are terminated); KDP has no public search API. Direct scraping of amazon.com violates Amazon Conditions of Use and triggers automated CAPTCHA challenges.
- Options:
  (a) Unauthenticated direct DOM scraping (Puppeteer/Cheerio against etsy.com, gumroad.com, amazon.com) — REJECTED: Violates ToS, high breakage risk, IP blocking, violates 08-ADAPTERS rule 2.
  (b) Web-search-backed targeted queries via existing Serper infrastructure (`site:etsy.com <query> (pdf OR digital download OR printable)`, `site:gumroad.com <query> (pdf OR guide OR checklist)`, `site:amazon.com <query> (kindle OR ebook OR paperback)`) behind the identical `SourceAdapter` interface — CHOSEN: 100% ToS-clean (no direct scraping), zero new vendor credentials required (reuses `SERPER_API_KEY` from DEC-002), extracts real product URLs, titles, pricing, ratings, and snippets. Degrades gracefully to `skipped` when `SERPER_API_KEY` is not present (PRD §55 completeness).
  (c) Paid scraping proxies / commercial marketplace APIs (e.g. Rainforest API, Bright Data) — REJECTED for MVP: adds recurring vendor cost, violating near-zero dev cost constraint (PRD §52/§62).
- Recommendation: Option (b) — web-search-backed marketplace adapters behind the normative `SourceAdapter` interface.
- Question for user: None required as plan specifies "(or web-backed where APIs absent), log approach per source in DECISIONS — §4c".
- Resolution: Resolved 2026-09-20 — implemented EtsyAdapter, GumroadAdapter, and KdpAdapter using targeted site-filtered search over Serper. Extracted products provide verified URLs, titles, price points, and review snippets without ToS violations or scraper fragility.

## DEC-008 — Long-tail phrase discovery (autocomplete) source, from the PDFMinter teardown

- Date: 2026-10-24
- Part: unassigned (proposed new part after the teardown; nothing built)
- Expected: competitor research only. `docs/research/2026-10-24-pdfminter-teardown.md`.
- Found: PDFMinter's core signal is keyless autocomplete expansion (question + modifier + A to Z)
  over Google, YouTube, Bing, DuckDuckGo and Amazon suggest endpoints. Its own readme calls them
  "unofficial public endpoints" that can block servers. PDF Lab has no phrase-level discovery
  source today, and `lib/sources/web` drops the `peopleAlsoAsk` / `relatedSearches` fields of
  Serper responses (no match in `lib/`; field names per Serper docs, re-verify at build time).
- Options:
  (a) Call the unofficial suggest endpoints directly, as PDFMinter does. Free and the widest
  coverage (5 engines incl. Amazon buyer intent). Conflicts with 08-ADAPTERS rule 2 and the
  DEC-007 precedent (Amazon Conditions of Use bar robots and data mining); breakage and IP
  blocks are expected.
  (b) Serper's autocomplete endpoint. Reuses `SERPER_API_KEY` (DEC-002), vendor-licensed, Google
  only, costs credits per expansion query (an A to Z + question plan is roughly 30 to 40 calls per
  seed). Endpoint and credit price seen only in a third-party listing so far.
  (c) DataForSEO autocomplete + Amazon keyword APIs. Covers Google and Amazon, paid per call, new
  vendor account.
  (d) Keep the `peopleAlsoAsk` and `relatedSearches` blocks from Serper calls PDF Lab already makes,
  and add Trends related queries per phrase. Zero new cost or vendor; fewer phrases than (a)-(c).
- Recommendation: (d) now, (b) as the opt-in expansion once its endpoint and price are verified
  via Context7 + serper.dev docs. Reject (a) for production for the same reason as DEC-007; it is
  acceptable only as a local, never-deployed experiment if the user wants a like-for-like replica.
  The Wikipedia pageviews adapter (official Wikimedia API) needs no decision.
- Question for user: Which discovery source should the replication part use: (d), (d)+(b), (c), or (a) local-only?
- Resolution: 2026-10-24, user chose (a) local-only: a like-for-like replica on the unofficial
  suggest endpoints that never runs in production. Enforced in code: the `autocomplete` adapter
  throws `SourceNotConfiguredError` (reported `skipped`) unless `PDFLAB_UNOFFICIAL_AUTOCOMPLETE=1`
  AND `NODE_ENV !== "production"` AND `VERCEL` is unset. Scope picked with it: quick-ideas layer,
  Wikipedia pageviews adapter, auto-outline (Phase 3 Parts 3.5 and 3.6). Not picked: PDF builder.
  The user will export PDFMinter CSVs for 3 to 5 seeds to calibrate the idea scores later.
  Shipping autocomplete to production needs a new decision (options (b) to (d) above).

## DEC-009 — Supabase project unreachable (DNS gone), live acceptance blocked

- Date: 2026-10-24
- Part: Phase 3 Part 3.5 (live ingest acceptance), Part 3.6 (live ideas acceptance)
- Expected: `.env.local` Supabase project `pdf-lab` (ref `cjboiijclrwumgmgzvcl`) accepts signal
  upserts, as in Parts 0.2 to 3.4.
- Found: `getaddrinfo ENOTFOUND cjboiijclrwumgmgzvcl.supabase.co`; `nslookup` via 1.1.1.1 says
  "Non-existent domain" while `supabase.co` resolves. Production
  `GET https://pdf-lab-puiads-projects.vercel.app/api/health` returns
  `{"ok":true,"schemaVersion":1,"db":{"configured":true,"error":"unreachable"}}`. Last recorded
  DB activity was 2026-09-28; free-tier projects pause after a week without activity, which
  matches. Not confirmed from the dashboard.
- Options: (a) user restores the project in the Supabase dashboard (Project → Restore), then the
  agent reruns the live ingest probes; (b) create a new free project and re-apply migrations 1 to
  5 (new keys in `.env.local` and Vercel); (c) keep building, accept unit tests only for now.
- Recommendation: (a). It keeps the data from Parts 1.1 to 3.4 and needs no key changes. Do (c)
  meanwhile; both parts stay open until the live checks pass.
- Question for user: Can you restore the `pdf-lab` project in the Supabase dashboard?
- Resolution: 2026-10-24, option (a): the user restored the project. The host resolves again and
  production `/api/health` returns `{"ok":true,"schemaVersion":1,"db":{"configured":true,"sources":6}}`.
  Live acceptance for Parts 3.5 and 3.6 then ran (results in `STATE.md`). Free-tier projects pause
  after about a week idle; expect this again until the project gets regular traffic or a paid plan.

## DEC-010 — Feature scope from the competitor sweep (PDFMinter, PDFMakerHub, other tools)

- Date: 2026-10-24
- Part: new Phase 3 Parts 3.7 to 3.11, rescoped 4.1 to 4.3, new 5.4
- Expected: competitor research only (`docs/research/2026-10-24-competitor-sweep.md`, following
  `2026-10-24-pdfminter-teardown.md`).
- Found: PDFMinter ends in a drag-and-drop builder, PDF export and share links; PDFMakerHub is a
  hand-written catalog whose "live" numbers are `Math.random()`; validators (Aurify, Selar) give
  GO / WAIT / KILL verdicts; Etsy tools (EverBee, eRank) measure competition from listings. PDF Lab
  has deeper evidence than all of them but nothing that turns an idea into a starting document, and
  its quick-ideas layer only works locally (DEC-008 keeps autocomplete out of production).
  PDFMinter's signed-in scans could not be captured: Cloudflare Turnstile failed in the built-in
  browser and in a Playwright-launched Edge window, and was not worked around.
- Options and answers: settled with the user in a grilling session, one question per branch,
  recommendation first. Rejected options are listed under each answer.
- Recommendation: as answered below (the user took the recommendation everywhere except the
  Google Doc export, the 3.11 file gate, and the 3.9 split that followed from it).
- Question for user: none left.
- Resolution: 2026-10-24.
  1. Boundary: PDF Lab stops at a build-ready brief. Rejected: a template PDF export, a full
     builder (keeps PRD §50's "no auto PDF generation"). Also out: share links, content import
     (Designrr pattern), the trending-news feed, revenue estimates, pre-written catalog ideas.
  2. Production phrase source: Serper `peopleAlsoAsk` + `relatedSearches` from calls PDF Lab
     already makes, plus Trends related queries (DEC-008 option (d)). Serper autocomplete (option
     (b)) is a later opt-in once its endpoint and price are verified. Part 3.7.
  3. Small adds, all taken: CSV export of a scan, a region picker, a "not professional advice" flag
     for health, money and legal ideas, recent searches and starter seed groups. Part 3.7.
  4. Year phrases ("budget 2027"): a "Timely" tag, never a trend label (QC Rule 2). Part 3.7.
  5. Niche catalog: PDFMakerHub's categories and PDFMinter's 32 seeds become starter seeds that
     start a live scan; no pre-written ideas or numbers (QC Rule 1). Part 3.7.
  6. Funnel, both ways: Validate and Deep research actions on each idea card; a seed's top 20
     quick ideas join the 50 Deep-run candidates, 25-distinct rules unchanged. Rejected: buttons
     only, replacing LLM candidates, hint only. Part 3.8.
  7. Verdict: Validate ends in GO / WAIT / KILL from fixed thresholds on stored counts, each shown
     beside its count; no LLM in the verdict (QC Rule 4). Part 3.8.
  8. Card ticks: a PDF Lab version of PDFMinter's 5-point checklist (demand, trend, PDF fit,
     effort, competition) with threshold and count per tick; competition blank until checked
     (QC Rule 3); the verdict stays in Validate. Part 3.8.
  9. Competition: an on-demand "Check competition" per idea over the Etsy / Gumroad / KDP adapters,
     stored as evidence; raw listing, review and price counts only, no $/month estimates.
     Rejected: auto-check of the top 10, specificity only. Part 3.9.
  10. Brief source: Deep-run opportunities and quick ideas that went through Validate (verdict GO
      or WAIT). Part 3.10.
  11. Brief contents: title, promise, audience, outline, buyer language, keywords, plus all four
      extras: where to sell, price anchor, listing copy, bonus angles. Part 3.10.
  12. Section writer: deterministic headings plus on-demand LLM section notes (cheap tier, cited,
      in the AI-interpretation layer, QC Rule 5). Rejected: headings only, full LLM draft. Part 3.10.
  13. Listing copy: Etsy title and 13 tags built from observed keywords within Etsy's limits
      (re-verified at build); the description drafted by the cheap LLM from cited buyer language.
      Part 3.10.
  14. Brief export: Markdown + DOCX in 3.10; "Send to Google Docs" as an app feature with PDF Lab's
      own OAuth client and the `drive.file` scope, after auth (new Part 5.4). Rejected: building
      OAuth before 5.1, Claude-connector-only.
  15. Calibration target: marketplace outcomes (listings with reviews, prices); PDFMinter's scores
      are a cross-check only. A one-off batch of about 300 Serper calls (5 seeds x top 20 ideas x 3
      marketplaces), balance checked first. Part 3.11.
  16. File gate: Part 3.11 waits for the user's PDFMinter scan file in
      `docs/research/pdfminter-exports/`; calibration is split out of 3.9 so the brief is not held
      up.
  17. Watchlist: 4.1 holds markets, seeds and saved ideas; 4.2 re-scans seeds daily and diffs
      snapshots ("new" and "history" trend bases, both dated); 4.3 adds an in-app weekly digest,
      email stays optional.
  18. Order: 3.7 → 3.8 → 3.9 → 3.10, with 3.11 whenever the file lands.
  Filled in when built, marked `shortcut:` until 3.11: verdict and tick thresholds, the not-advice
  keyword list, the starter seed list.

## DEC-011 — Per-scan region needs an optional `geo` on `CollectInput`

- Date: 2026-10-24
- Part: Phase 3 Part 3.7
- Expected: Part 3.7 task 2 (region picker per scan) sets Trends `geo` and the suggest engines'
  country / language parameters; `lib/sources/types.ts` says any change to the adapter shapes needs
  an entry here.
- Found: adapters only read their region from env at construction, so a per-scan region has no way
  in. Live Serper check the same day: `peopleAlsoAsk` items carried only `question` (the docs example
  also shows snippet / title / link), and `gl=gb` "budgeting" and `gl=ca` "meal prep" returned
  neither `peopleAlsoAsk` nor `relatedSearches`.
- Options: (a) optional `geo?: string` on `CollectInput`, passed through `runIngest`; adapters
  without regions ignore it. (b) one adapter instance per region. (c) env-only region (no picker).
- Recommendation: (a): additive, no existing adapter or caller changes behaviour.
- Question for user: none. The phase file already decides the feature; this records the interface
  change.
- Resolution: 2026-10-24, (a). `docs/08-ADAPTERS.md` interface updated. Google Trends, autocomplete
  and web (Serper `gl` + `hl=en`) read it; Wikipedia stays English. The region is part of each
  external id, so scans per region dedup separately. Outside the US, expect the Serper phrase blocks
  to be empty often; quick ideas there rest on Trends related queries.


## DEC-012 — Default free OpenRouter model withdrawn; Deep runs extract nothing

- Date: 2026-10-24
- Part: Phase 3 Part 3.8 (acceptance: a Deep run on a seed with stored ideas returns 25 distinct
  opportunities with at least one traced to an idea phrase)
- Expected: the cheap and strong tiers default to `nex-agi/nex-n2.5-pro:free` ($0, used for the 1.3
  and 1.5 live runs).
- Found: OpenRouter answers 404 "This model is unavailable for free. The paid version is available
  now". Deep run `171abdef` on "budgeting" walked all 10 states to `completed` with 91 discussion
  signals, 0 analyzed, 0 markets, 0 opportunities and 40% completeness. Extraction failures do not
  fail the run or reach the server log (a separate defect, logged for 6.x).
- Options (prices from the OpenRouter models API, 2026-10-24):
  (a) paid `nex-agi/nex-n2.5-pro`, $0.075 / M input, $0.25 / M output; about $0.01 per Deep run of
      ~100 signals. Same model as before, so extraction quality is unchanged.
  (b) another free model with JSON output: `google/gemma-4-31b-it:free` or
      `nvidia/nemotron-3-super-120b-a12b:free`. $0; free models can be withdrawn again the same way,
      and extraction quality needs a spot check.
  (c) local Ollama (`AI_CHEAP_PROVIDER=ollama`). $0, needs a model pulled on this machine; not
      usable from Vercel.
  All three are env changes (`OPENROUTER_CHEAP_MODEL` / `OPENROUTER_STRONG_MODEL`, or the default in
  `lib/ai/providers/openrouter.ts`); no Part 3.8 code depends on the choice.
- Recommendation: (a). It costs about a cent per run and does not break again when a free tier ends.
- Question for user: which model should the cheap and strong tiers use?
- Resolution: 2026-10-24, (b) `google/gemma-4-31b-it:free`, set as `OPENROUTER_DEFAULT_CHEAP_MODEL`
  (both tiers use it unless env overrides). Right after the switch, four probes over ~80 s got 429
  "temporarily rate-limited upstream" (Google AI Studio), so extraction quality and the Part 3.8
  Deep-run acceptance are still unverified. A later gemma probe was still 429. The user then asked
  for `nvidia/nemotron-3-super-120b-a12b:free`: three probes over ~30 s returned 404 from the Nvidia
  provider ("Function ... Not found for account"), so the default was left on gemma.
  Final, same day: the user chose `openrouter/free` (OpenRouter picks a served free model per call;
  a JSON probe routed to `dots-studio/dots-3-note-preview:free`). It is now
  `OPENROUTER_DEFAULT_CHEAP_MODEL`. Why the named free models failed: each has one upstream provider
  (Google AI Studio's free pool was rate-limited, Nvidia's endpoint showed status -5 and 0% uptime,
  nex had no free endpoint). Separately, the key's account has $0 of credits purchased, so OpenRouter
  allows 50 free calls a day (1,000 after $10 ever purchased). A Deep run makes one extraction call
  per signal, so a ~90-signal run exhausts the day: Deep run `7feb9fb2` analyzed 17 of 91 signals
  before the cap (57 of 50 calls used). A different key on the same account has the same limits.
  Follow-ups: $10 of credits (or a paid model) before Deep runs are relied on; extraction failures
  should surface in the run (6.x).

## DEC-013 — NVIDIA's hosted API as the chat provider (user-supplied key, 40 rpm)

- Date: 2026-10-24
- Part: Phase 3 Part 3.8 follow-up (DEC-012 left Deep runs capped at 50 free OpenRouter calls a day)
- Expected: the user added `NVIDIA_API_KEY` to `.env.local` (rate limit 40 requests a minute) for
  the cheap and strong tiers.
- Found: `GET /v1/models` lists 85 models, but most are not deployed for this key. Chat calls returned
  404 "Function ... Not found for account" for `nemotron-3-super-120b-a12b` (the same outage seen
  through OpenRouter), `nemotron-nano-3-30b-a3b`, `llama-3.1-nemotron-70b-instruct`,
  `mistral-large-2-instruct`, `mistral-nemo-12b-instruct` and `kimi-k2.6`. `gemma-4-31b-it` and
  `deepseek-v4.1-flash` gave no headers within 60 s or more. `nemotron-3.5-lightning-30b-a3b` and
  `openai/gpt-oss-20b` answer, but both reason first: at default effort gpt-oss spent the whole
  500-token extraction budget and returned no content on 5 of 8 signals.
- Options: (a) `openai/gpt-oss-20b` with `reasoning_effort: "low"`; (b) raise every max_tokens budget
  so reasoning fits; (c) keep OpenRouter only.
- Recommendation and resolution (2026-10-24, (a)): with `reasoning_effort: "low"` gpt-oss extracted
  12 of 12 stored "budgeting" signals (about 8 s each at concurrency 2, schema-valid). Implementation:
  the OpenAI-compatible provider class is reused as provider `nvidia` (`NVIDIA_API_KEY`,
  `NVIDIA_BASE_URL`, `NVIDIA_RPM` default 40, `NVIDIA_REASONING_EFFORT` default "low",
  `NVIDIA_CHEAP_MODEL` / `NVIDIA_STRONG_MODEL` default `openai/gpt-oss-20b`), with a request throttle
  (60 000 / rpm ms between starts), a 60 s timeout and one retry on 429. The router order is now
  ollama, nvidia, openrouter, openai-compatible, and the strong tier's first choice is nvidia; with no
  NVIDIA key (Vercel today) the chain falls through to openrouter as before. Embeddings stay on
  openrouter (no 1536-dim model on NVIDIA). Fallback health checks are cached for 60 s so they do not
  add a request per call. Production needs `NVIDIA_API_KEY` in Vercel to use it (not set by this
  change).
  Measured in the Deep run: calls take 13 to 28 s when several run at once (NVIDIA queues them),
  about 7 signals a minute at concurrency 2 or 5, so the orchestrator's fixed 5-minute extract step
  failed twice. The extract step now budgets 10 s per unanalyzed signal (minimum 5 minutes). Deep run
  `de881e6b` on "budgeting" then completed in 17.7 minutes with 97 of 102 signals analyzed. That
  length does not fit a Vercel function; Deep runs in production need a background job (4.2 decides
  the scheduler, DEC-001).
