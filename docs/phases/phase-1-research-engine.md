# PHASE 1 — Research engine (adapters → signals → extraction → clusters → evidence)

Goal: `query → stored evidence → scored market candidates`, fully countable.
PRD refs: §10–§16, §30–§31, §38. Phase gate: one niche query produces stored signals,
extraction rows, clusters with scores+confidence, and a run that walks the lifecycle
(05-PIPELINE-SCORING) with per-transition counts.

Load: phase-0 files + `04-SCHEMA.md → 05-PIPELINE-SCORING.md → 06-EVIDENCE-CONTRACT.md →
07-AI-ROUTER.md → 08-ADAPTERS.md → guides/sources-reddit-trends-search.md,
guides/ai-providers.md, guides/supabase-pgvector.md`.

## Part 1.1 — SourceAdapter interface + registry + Reddit adapter (read-only)

- Deps: 0.2. Touches: `lib/sources/*`, `app/api/sources/health/route.ts`.
- Tasks:
  1. Implement `SourceAdapter` + `MarketSignal` types + registry EXACTLY per `08-ADAPTERS.md`.
  2. Reddit adapter (authenticated script/OAuth preferred): subreddit+query search,
     map to normalized signals, hash/drop authors, respect rate limits, `healthCheck`.
  3. `GET /api/sources/health` returns per-adapter ok/detail.
  4. Unit test: fixture Reddit payload → normalized signal (labeled fixture).
- Acceptance: live query (e.g. `pc troubleshooting`, limit 10) stores 10 deduped `signals`
  rows with source `reddit`; health endpoint green; no raw usernames in DB.
- ToS scrape risk or auth-shape mismatch → DECISION REQUEST (§4c/§4a).
- Guides: `guides/sources-reddit-trends-search.md`.

## Part 1.2 — Trends adapter + web-search adapter + normalized ingest

- Deps: 1.1. Touches: `lib/sources/gtrends/*`, `lib/sources/web/*`, `lib/ingest/*`,
  `app/api/ingest/route.ts`.
- Tasks:
  1. DEC-002 FIRST: pick ONE free-tier search provider (Brave/Serper/Tavily/Bing) on live
     pricing; log choice in DECISIONS.
  2. Trends adapter: interest-over-time + related queries, cached ≥24h, isolated module
     (unofficial API — expect breakage; breakage = decision request, not hack).
  3. Web adapter behind same interface (URL+title+snippet+date).
  4. Ingest pipeline: collect → normalize → dedup on `(source_id, external_id)` → insert;
     `POST /api/ingest {query, limit}` returns per-source counts.
- Acceptance: ingest `pc troubleshooting` across 3 adapters; counts returned; rerun
  inserts ~0 duplicates; killing one adapter still completes with honest counts.
- Guides: same sources guide.

## Part 1.3 — AI extraction via AIRouter

- Deps: 1.2. Touches: `lib/ai/*`, `app/api/extract/route.ts`.
- Tasks:
  1. `AIRouter` with provider registry (OpenAI-compatible + Ollama-local FIRST for
     near-zero dev cost; Gemini/Bedrock/OpenRouter pluggable) per `07-AI-ROUTER.md`.
  2. Extraction job: per signal → `{audience, problem, intent(weak|medium|strong|
     very_strong), urgency, pdf_relevance 0..1}` validated object → upsert
     `signal_analysis` (one row per signal).
  3. Cheap-tier model default; log tokens/calls per run (feeds Phase 5 pricing).
  4. `POST /api/extract {run_id|signal_ids}`; extraction NEVER invents signals.
- Acceptance: 50 ingested signals → 50 analysis rows, all schema-valid; intent labels
  match PRD §14 examples on spot-check; cost log exists.
- Guides: `guides/ai-providers.md`.

## Part 1.4 — Problem clustering (pgvector) + market scoring

- Deps: 1.3. Touches: `lib/cluster/*`, `lib/scoring/*`, `app/api/cluster/route.ts`.
- Tasks:
  1. Embed signals (embed-tier model; dim MUST match `signal_analysis.embedding`);
     cosine-similarity clustering → named clusters (PRD §15 shape: name, frequency,
     growth, audience, urgency, language, related products).
  2. Market candidates from clusters; score per 05 formula
     (Demand×Momentum×Frequency×Intent×PDFfit ÷ Density) storing
     `{score, confidence, evidence_count}` — confidence LOW when data thin.
  3. PDF-suitability check per §17 (high: checklist/guide/planner/…; low: physical,
     realtime, human-service, complex-software).
- Acceptance: `pc troubleshooting` yields clusters resembling PRD §15 (boot/drivers/
  wifi/slow/BSOD/gaming/BIOS families); every market has score+confidence+count;
  scores change monotonically with evidence in a smoke test.
- Guides: `guides/supabase-pgvector.md`, `guides/ai-providers.md`.

## Part 1.5 — Evidence store + confidence + run-lifecycle wiring

- Deps: 1.4. Touches: `lib/evidence/*`, `lib/runs/*`, `app/api/runs/*`.
- Tasks:
  1. Evidence writer: every analytical claim (market/score/trend/competition) inserts
     `evidence` rows `{source, URL, date, excerpt, signal type, confidence}`.
  2. Run orchestrator through ALL lifecycle states (05) with per-state counts;
     `GET /api/runs/[id]` exposes progress (PRD §38 UI reads this later).
  3. Enforce QC rules 1–5 in code paths (06): block opportunity-without-evidence,
     trend-without-temporal-data, demand-without-counts at write time.
  4. Research-completeness counters (sources, signals, markets, opportunities,
     evidence-backed count) per PRD §55.
- Acceptance: full run returns COMPLETED with lifecycle trace; zero-evidence run is
  impossible by construction (test asserts the block); completeness numbers reconcile
  with `select count(*)` queries.
- Review: full checklist + Phase-1 gate.
