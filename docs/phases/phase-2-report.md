# PHASE 2 — PDF LAB report (25 opportunities → pages → competition → export)

Goal: the MVP output — a niche in, an evidence-backed 25-opportunity report out.
PRD refs: §18–§21, §28–§29, §46–§47, §55, §62. Phase gate: ★ MVP GATE — input
`pc troubleshooting` produces 25 genuinely distinct opportunities with problems, intent,
trends, competition, gaps, formats, source links, confidence, at near-zero dev cost.

Load: Phase-1 files + `05-PIPELINE-SCORING.md → 06-EVIDENCE-CONTRACT.md → 09-UX-SPEC.md`.

## Part 2.1 — 25-opportunity generator (diversification constraints)

- Deps: 1.5. Touches: `lib/opportunities/*`, `app/api/opportunities/generate/route.ts`.
- Tasks:
  1. Strong-tier synthesis over clusters+evidence: 50 candidates → select EXACTLY 25,
     diversified across audiences/problems/formats/urgency/price/sophistication/
     mechanism/outcome (PRD §29 — 25 variations of one product FAILS).
  2. Each writes `opportunities` row with score+confidence+evidence links (QC Rule 1).
  3. Deterministic-ish: same evidence snapshot → stable set (log prompt version).
- Acceptance: `pc troubleshooting` → 25 rows, pairwise-distinct on (audience, problem,
  format); every row has ≥1 evidence row; rerun stable ± documented tolerance.
- Guides: `guides/ai-providers.md`.

## Part 2.2 — Opportunity + market report pages with citations

- Deps: 2.1. Touches: `app/markets/[id]/*`, `app/opportunities/[id]/*`, `components/evidence/*`.
- Tasks:
  1. Market page per 09-UX-SPEC (bars+confidence, why-market, buyer language,
     competitors, gaps, opportunities list).
  2. Opportunity detail per PRD §47 (all 14 blocks incl. TOC, bonuses, positioning,
     keywords, customer language, evidence sources — every claim cited/clickable).
  3. Facts vs interpretation vs suggestion visually separated (QC Rule 5).
- Acceptance: click any number → its evidence list; any claim → its sources; no
  uncited superlatives in copy (grep review).
- ★ MVP GATE runs here (with export-min from 2.4 if needed to demonstrate).
- Guides: `guides/shadcn-tailwind.md`, `guides/nextjs.md`.

## Part 2.3 — Competition analysis + review mining (Tier-2 adapters)

- Deps: 2.1. Touches: `lib/sources/etsy/*`, `lib/sources/gumroad/*`,
  `lib/sources/kdp/*` (or web-backed where APIs absent), `lib/competition/*`.
- Tasks:
  1. Tier-2 adapters behind the SAME interface (ToS-checked; web-search-backed where no
     API; log approach per source in DECISIONS — §4c).
  2. Extract title/seller/platform/price/format/rating/reviews/positioning/promises;
     cluster landscape (PRD §20 — percentages ONLY from collected data).
  3. Review mining → likes/dislikes/missing/confusing/requests → product gaps
     (PRD §21, e.g. "too technical" → plain-English opportunity).
- Acceptance: market page shows competitors with real URLs/prices; landscape shares sum
  from observed rows; ≥1 gap traces to quoted review excerpts.
- Guides: sources guide + `08-ADAPTERS.md`.

## Part 2.4 — Export (MD/CSV/JSON) + research-quality panel

- Deps: 2.2, 2.3. Touches: `app/api/export/*`, `components/quality-panel/*`.
- Tasks:
  1. Export full report as Markdown + CSV + JSON (PDF/Notion/GDocs post-MVP per §46).
  2. Quality panel per PRD §55: completeness %, sources, signals, markets,
     opportunities, evidence-backed count.
  3. Export includes evidence URLs + confidence (round-trip: re-import JSON recounts).
- Acceptance: exported files contain all 25 opps + evidence links; counts match UI;
  JSON re-validates against schema.
- Review: full checklist + Phase-2/MVP gate.
