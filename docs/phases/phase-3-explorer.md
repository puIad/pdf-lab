# PHASE 3 — Market explorer (browse, search, radar, NL research)

Goal: the continuously-updated market database homepage + discovery surfaces.
PRD refs: §7–§9, §22–§27, §40–§42. Phase gate: explorer, search, radar, and NL modes all
read LIVE DB (no mocks), scores evidence-derived, every number clickable to evidence.

Load: Phase-1/2 files + `09-UX-SPEC.md → 06-EVIDENCE-CONTRACT.md`.

## Part 3.1 — Market Explorer homepage (DB-backed)

- Deps: 1.5. Touches: `app/page.tsx`, `components/markets-table/*`.
- Tasks:
  1. Dashboard shell per PRD §40 (search box, four sections, Run Deep Research CTA).
  2. Explorer table per PRD §7 (Market|Demand|Trend|Competition|Opportunity + confidence);
     filters: trend/intent/competition/PDF-fit; pagination; empty states honest.
  3. shadcn Table/Badge/Skeleton; loading + error states.
- Acceptance: with seeded markets, table renders from DB; filters change results;
  with empty DB, honest empty state (no fake rows).
- Guides: `guides/shadcn-tailwind.md`.

## Part 3.2 — Market search + market overview page

- Deps: 3.1. Touches: `app/search/*`, `app/api/search/route.ts`.
- Tasks:
  1. Free-text niche/audience search ("pc troubleshooting", "students", …) returning the
     PRD §8 overview: size proxy, search interest, trend direction, discussion counts,
     buyer-intent signals, marketplace activity, competitive density, pains,
     underserved submarkets — each backed or explicitly "not observed".
  2. Persist searches as `research_runs` (mode explore/validate) for history.
- Acceptance: three probe queries return overviews where every line cites evidence or
  says unobserved; history persists per user.

## Part 3.3 — Find Trending Markets engine + Market Radar

- Deps: 3.1. Touches: `lib/trends/*`, `app/api/radar/route.ts`, `components/radar/*`.
- Tasks:
  1. Multi-window detection (7d/30d/90d+12m, PRD §22) over discussion velocity, search
     proxy, new-product counts, repeated requests, emerging terms, seasonality flags.
  2. Classify `emerging|accelerating|seasonal|stable|declining|unknown` WITH evidence
     deltas (PRD §23 example format: +41% discussions, +27% search, +18 products/30d).
  3. Radar UI per PRD §25 (🔥 emerging / 📈 accelerating / 🌱 early signal) + seasonal
     engine queries ("likely to surge in next 60 days", PRD §24).
- Acceptance: known spike fixture classified correctly with deltas shown; seasonal
  probe returns dated reasoning; no label without temporal evidence (QC Rule 2 test).

## Part 3.4 — Natural-language research + modes

- Deps: 3.2, 3.3. Touches: `lib/planner/*`, `app/api/research/route.ts`.
- Tasks:
  1. NL → structured research query (audience/problem/intent/competition filters) for
     PRD §26 example questions.
  2. Modes Explore/Validate/Hunt/Deep/Monitor (PRD §27) mapping to pipeline depths;
     Validate investigates the user's exact concept (PRD §48 output blocks) instead of
     inventing alternatives; `pdf-lab <niche>` signature flow (PRD §28) as UI + API.
  3. Mode + prompt version logged per run.
- Acceptance: one probe per §26 question returns sensible scoped runs; Validate on a
  user concept returns demand/audience/complaints/products/pricing/gaps/risks with cites.
- Review: full checklist + Phase-3 gate.

## Part 3.5 — Keyless discovery adapters (local-only autocomplete + Wikipedia)

Added 2026-10-24 from the PDFMinter teardown (`docs/research/2026-10-24-pdfminter-teardown.md`)
and DEC-008.

- Deps: 1.2. Touches: `lib/sources/autocomplete/*`, `lib/sources/wikipedia/*`, `lib/sources/index.ts`.
- Tasks:
  1. `autocomplete` adapter: Google, YouTube, Bing, DuckDuckGo, Amazon suggest; expansion plan
     = seed + question prefixes + modifiers (all engines) + A to Z (Google only); one signal per
     unique phrase with engine count and best position. LOCAL-ONLY guard per DEC-008.
  2. `wikipedia` adapter: official Action API title resolution (skip disambiguation, require
     the seed's words in the title) + Wikimedia pageviews REST; one signal with the last 28 days
     vs the previous 56 days (two windows, QC Rule 2). Descriptive User-Agent, no personal data.
  3. Both: cache, throttle, `healthCheck`, `SourceNotConfiguredError` / honest failure.
- Acceptance: unit tests on labeled fixtures (zero network); live ingest of one seed stores
  autocomplete + wikipedia signals locally; with the guard off, autocomplete reports `skipped`.

## Part 3.6 — Quick ideas + auto-outline

- Deps: 3.5. Touches: `lib/ideas/*`, `lib/ingest/pipeline.ts` (optional signal sink),
  `lib/sources/gtrends` (engagement keys), `app/api/ideas/route.ts`, `app/ideas/*`.
- Tasks:
  1. Seed → ingest (autocomplete, gtrends, wikipedia) → per-phrase ideas: format, title,
     intent, demand (cites engine count + best position, QC Rule 4), PDF fit, trend only when
     Trends rising data exists (else "not observed", QC Rule 2), effort, interest band,
     phrase specificity. Specificity is NOT a competition claim (QC Rule 3): the UI says so.
  2. Opportunity = weighted demand + fit + trend bonus. `shortcut:` until calibrated on the
     user's PDFMinter CSV exports.
  3. Auto-outline: rank related phrases (opportunity, question bonus, token overlap), drop
     near-duplicates, phrase → heading, pad with own per-format default sections.
  4. `POST /api/ideas` + `/ideas` page (cards, filters, outline per idea) from `components/ui`.
- Acceptance: unit tests for scoring + outline; live seed returns ideas whose numbers trace to
  stored signals; outline for one idea has no near-duplicate headings.
