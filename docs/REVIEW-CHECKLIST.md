# REVIEW CHECKLIST — run for EVERY part (nothing merges unchecked)

Copy this block into the part's completion report and mark each item.

## A. Acceptance (from the phase file)

- [ ] Every acceptance bullet of the part passes, demonstrated with real command output
      (not "should work" — paste the command + result).
- [ ] No scope creep: files outside the part's "touches" list are untouched (or the
      spillover is logged in `STATE.md` as deferred).

## B. Evidence contract (06-EVIDENCE-CONTRACT.md)

- [ ] No new market/competition/trend claim in code, copy, or fixtures without a backing
      `evidence` path (or `fixture` label where fixtures are allowed).
- [ ] No raw third-party usernames stored; no secrets in code/env examples.
- [ ] Degraded-source behavior correct: fewer sources → honest completeness output, no filler.

## C. Architecture

- [ ] Source code only behind adapters (`lib/sources/*`); app calls `AIRouter`, never a
      provider SDK; scores always ship with confidence.
- [ ] Migration (if any) applies cleanly forward AND the schema matches `04-SCHEMA.md`
      (or the doc was updated via a DEC entry).

## D. Regression + hygiene

- [ ] `pnpm lint`, `pnpm typecheck` (or `tsc --noEmit`), `pnpm build` green.
- [ ] Previous parts' acceptance still holds (spot-check the linked dependency).
- [ ] Commit made as `phase-<N>-part-<M>: <summary>`; hash recorded in `STATE.md`;
      part marked `done` (or `blocked` + DEC-ID).

## Phase gates (additionally, when finishing a phase's last part)

- Phase 1: niche query → stored signals + extraction + clusters + scores, all countable.
- Phase 2: ★ MVP gate — `pc troubleshooting` → 25 distinct evidence-backed opportunities.
- Phase 3: explorer + search + radar all read live DB, no mocks.
- Phase 4: watchlist → scheduled re-run → visible change report.
- Phase 5: quota enforced, BYOK routes correctly, usage metered.
- Phase 6: QC rules + confidence + metrics + launch checklist all signed.
