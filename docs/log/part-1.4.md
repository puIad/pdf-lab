# Part 1.4 — Clustering (pgvector) + market scoring

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

AIRouter.embed (1536-dim via OpenRouter text-embedding-3-small); cosine similarity clustering (PRD §15 shape); evidence-backed scoring (Demand×Momentum×Frequency×Intent×PDFfit ÷ Density) + confidence gates; PDF suitability check (PRD §17); POST /api/cluster; 62/62 tests pass, lint+typecheck+build green. Live acceptance: 25 signals embedded (1536-dim in signal_analysis.embedding), clustered into 14 distinct problem markets persisted in markets and market_signals; confidence low (<0.35) for thin clusters, monotonic scaling proven.
