# PHASE 6 — Hardening & launch (QC, metrics, go-live)

Goal: prove trust + usefulness, then launch scoped. PRD refs: §50, §53–§55, §57–§59.
Phase gate (launch gate): QC rules enforced in code, confidence displayed everywhere,
metrics events firing, cost-per-run known, legal/ToS reviewed, roadmap handed off.

## Part 6.1 — QC enforcement + confidence display + anti-gaming review

- Deps: 2.4, 3.4. Touches: validators, UI copy pass, tests.
- Tasks:
  1. Codify PRD §53 1–5 as blocking validators with tests (each rule has a failing-case
     test proving the block).
  2. PRD §54 pass: every score/label shows confidence + basis or explicit uncertainty;
     audit-grep for banned phrases ("huge market", "high demand" without counts).
  3. Fixture purge: no `fixture` data reachable in production paths.
- Acceptance: all five negative tests pass; copy audit clean; fixtures isolated to tests.

## Part 6.2 — Success-metrics instrumentation

- Deps: 6.1. Touches: `lib/analytics/*`, key click/save handlers.
- Tasks:
  1. Events per PRD §58: opportunity saved (usefulness), useful-vote (quality),
     claim-evidence coverage (auto-computed), new-market detections, research→creation
     conversion, monitor returns (retention).
  2. North-star dashboard (internal): Validated Opportunities Discovered per Active User
     (PRD §59) — NOT searches performed.
- Acceptance: click save → event row; dashboard renders north-star from real events.

## Part 6.3 — Launch checklist + handoff

- Deps: 6.2. Touches: docs only (+ fixes found).
- Tasks:
  1. Costs: per-run $ at free/BYOK/premium; monthly projection at 100/1k/10k users.
  2. Abuse/legal: rate limits, ToS review per source (esp. marketplace/Tier-3 — TikTok
     stays OUT per §50), privacy (hashed authors), takedown/export-deletion path.
  3. Roadmap handoff per PRD §57 (V1 discovery → V1.5 marketplace → V2 monitoring →
     V2.5 alerts → V3 creation assistant → DISCOVER→…→SELL pipeline).
  4. Update STATE (all done), close or carry DEC entries, tag release.
- Acceptance: checklist signed in file; `git tag mvp-v1`; next-roadmap issues filed.
- Review: full checklist + LAUNCH gate. Ship it.
