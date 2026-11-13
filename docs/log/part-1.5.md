# Part 1.5 — Evidence store + confidence + run lifecycle

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

Evidence writer (evidence table with claims/excerpts/urls/signal_types); QC Rules 1–5 enforced in code paths (blocks unevidenced opportunities, untimed trends, count-less demand); 10-state lifecycle orchestrator (queued→completed) with trace; research completeness panel (sources, signals, markets, opportunities, evidence-backed count); POST /api/runs & GET /api/runs/[id]; 81/81 tests pass, lint+typecheck+build green. Live run: pc troubleshooting walked all 10 states to completed with 94% completeness, 38 evidence rows stored and reconciled with select count(*). Phase 1 fully complete.
