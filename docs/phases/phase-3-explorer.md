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

## Part 3.7 — Production phrase source + scan conveniences

Added 2026-10-24 from the competitor sweep (`docs/research/2026-10-24-competitor-sweep.md`) and
DEC-010. Parts 3.7 to 3.10 run in order; 3.11 runs when its input file lands.

- Deps: 3.6. Touches: `lib/sources/web/*`, `lib/ideas/*`, `app/api/ideas/route.ts`, `app/ideas/*`,
  `lib/export/*`.
- Tasks:
  1. Web adapter keeps Serper's `peopleAlsoAsk` and `relatedSearches` blocks as phrase signals
     (field names re-verified via Context7 + serper.dev docs first). Quick ideas use them plus
     Trends related queries whenever the autocomplete guard is off, which is always the case in
     production. Demand cites which blocks returned the phrase (QC Rule 4). Serper autocomplete
     stays a later opt-in (DEC-008 (b)).
  2. Region picker per scan: Trends `geo` and the suggest engines' country / language parameters.
     Wikipedia stays English.
  3. Recent searches (local until 5.1 adds users) and starter seed groups built from PDFMakerHub's
     categories and PDFMinter's 32 seeds. The list is `shortcut:` until the user reviews it. A seed
     only starts a live scan; nothing pre-written is shown (QC Rule 1).
  4. CSV export of a scan through the 2.4 export engine: every score with its evidence counts.
  5. "Not professional advice" flag: deterministic health / money / legal keyword list
     (`shortcut:`); flagged ideas get a badge, and their briefs (3.10) get the note.
  6. "Timely" tag for phrases naming the current or next year, explained as "dated phrase, may
     need a yearly refresh". Never a trend label (QC Rule 2).
- Acceptance: with the autocomplete guard off, a live seed returns ideas from PAA / related /
  Trends rows that exist in `signals`; a region change alters the outgoing parameters (unit) and
  the results (live probe); CSV round-trips via the 2.4 recount; flag and Timely unit tests.

## Part 3.8 — Ideas ↔ pipeline + Validate verdict

- Deps: 3.7, 3.4. Touches: `app/ideas/*`, `lib/planner/*`, `app/api/research/route.ts`,
  `lib/opportunities/*`.
- Tasks:
  1. Card actions: "Validate" runs Validate mode on the idea's phrase as the concept; "Deep
     research" starts a Deep run on the seed.
  2. Deep runs: the seed's top 20 quick ideas (by opportunity, near-duplicates dropped by token
     overlap) join the candidate pool that makes the 50; the 25-distinct diversification rules are
     unchanged (PRD §29, §52).
  3. Validate verdict GO / WAIT / KILL from fixed thresholds on stored counts: demand signals,
     buyer-intent share, observed competitors, trend windows. Each threshold is shown beside its
     count. No LLM in the verdict (QC Rule 4). Thresholds `shortcut:` until 3.11.
  4. Card ticks: demand, trend, PDF fit, effort, competition, each with its threshold and count.
     The competition tick stays blank until a 3.9 check has run (QC Rule 3).
- Acceptance: a Deep run on a seed with stored ideas has at least one candidate traced to an idea
  phrase and still returns 25 distinct opportunities; Validate on three probe concepts returns
  verdicts whose reasons reconcile to SQL counts; tick logic unit-tested.

## Part 3.9 — On-demand competition check per idea

- Deps: 3.8, 2.3. Touches: `lib/competition/*`, `app/api/ideas/*`, `app/ideas/*`.
- Tasks:
  1. "Check competition" on a card runs the Etsy / Gumroad / KDP adapters (DEC-007) for that
     phrase and stores the listings as evidence.
  2. The card shows listings found per marketplace, review counts and the price range. Raw counts
     only: no revenue or $/month estimate.
  3. Once a check exists, the competition label and tick switch from phrase specificity to the
     observed counts.
- Acceptance: a live check on two ideas stores listing rows and the card numbers reconcile with
  them; no Serper call happens without a click (test).

## Part 3.10 — Build-ready brief

- Deps: 3.9, 2.2. Touches: `lib/brief/*`, brief pages under `app/`, `lib/export/*`.
- Tasks:
  1. Sources: a Deep-run opportunity, or a quick idea that went through Validate with verdict GO
     or WAIT. A raw idea offers "Validate first".
  2. Contents: title, one promise, audience, outline (deterministic headings), on-demand LLM
     section notes per heading (cheap tier via AIRouter, each citing its evidence ids, shown as AI
     interpretation per QC Rule 5), buyer language (verbatim, sourced), keywords, where to sell
     (marketplaces where competitors were observed, with counts), price anchor (observed range,
     cited), listing copy, bonus angles (add-on worksheets / trackers / checklists from related
     phrases and review gaps), and the not-advice note when flagged.
  3. Listing copy: Etsy title and 13 tags built from observed keywords within Etsy's limits
     (140-character title, 20-character tags; re-verify before building); the Gumroad / Etsy
     description drafted by the cheap LLM from cited buyer language.
  4. Export Markdown (2.4 engine) and DOCX (library verified via Context7 before install).
- Acceptance: one brief from an opportunity and one from a validated idea; every factual line
  cites evidence and every LLM line sits in the AI layer; the DOCX opens and its text round-trips;
  Etsy limits unit-tested.

## Part 3.11 — Score calibration (blocked on the user's PDFMinter scan file)

- Deps: 3.9 + a scan file in `docs/research/pdfminter-exports/` (instructions there; DEC-010).
  Touches: `lib/ideas/*`, verdict and tick thresholds, `docs/research/`.
- Tasks:
  1. Check the Serper credit balance, then run the one-off batch: 5 seeds (budgeting, meal prep,
     keto diet, toddler sleep, pc troubleshooting) x top 20 ideas x 3 marketplaces, about 300
     calls, stored as evidence.
  2. Refit demand / opportunity weights and the verdict and tick thresholds against marketplace
     outcomes (listings with reviews, prices); remove the `shortcut:` markers the fit replaces.
  3. Compare PDF Lab's rankings with PDFMinter's scores from the scan file and append the
     comparison, plus what the file reveals about PDFMinter's server formulas, to the research doc.
- Acceptance: a documented fit (method, data, before / after agreement with marketplace
  outcomes) and the PDFMinter comparison table in `docs/research/`.
