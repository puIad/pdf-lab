# PDF Lab docs

The plan lives in [GitHub issues](https://github.com/puIad/pdf-lab/issues). This folder holds what
the code cannot say for itself: the rules, the specs and the decisions. The PRD (`../pdf-lab.md`,
if present) is the vision; on implementation detail these files win.

## How work happens

1. Pick an issue. `part` is a planned unit of the original plan, `defect` is a known fault,
   `needs-user` waits on something only the repo owner can do. An issue's body carries its tasks
   and its acceptance; its comments carry what was measured.
2. Read the specs the issue touches (file map below) and the code. Nothing else has to be loaded.
3. Branch, build, and verify for real: commands and their output, not "should work".
4. One issue is one commit. A part keeps the old form, `phase-<N>-part-<M>: <summary>`; a defect
   is `fix: <summary>`. The pull request body says `Fixes #<issue>`.
5. Run the review checklist below before merging. What was verified, and what was not, goes in the
   pull request or an issue comment.
6. A fault found on the way that is not part of the issue becomes a new `defect` issue. It is not
   fixed silently and not left in a comment.

## Rules that override everything

1. **Evidence before synthesis** (`EVIDENCE-CONTRACT.md`). No market claim without stored evidence
   rows. When the data does not support an output, return less and say "Not observed". Never pad
   to a target count.
2. **Adapter boundary** (`ADAPTERS.md`). No source-specific code outside `lib/sources/*`. App code
   calls the `AIRouter`, never a provider SDK.
3. **Problems stop work.** See "Decision requests" below.
4. **Frontend from `components/ui`.** Build pages and components from the primitives there. Add a
   primitive there before reaching for another source (DEC-016).
5. **Docs are not build-time truth for libraries.** Before installing or using a library, check
   its current docs (Context7, then the canonical site; Next.js also in
   `node_modules/next/dist/docs/`). A mismatch with `STACK.md` is a decision request, never a
   silent upgrade or downgrade.

## Decision requests

Stop and ask when any of these happens:

- a library or API does not match what the specs say (changed API, dead package, new pricing);
- a task is ambiguous or contradicts another doc or the PRD;
- a step implies real cost, a terms-of-service risk or credential exposure;
- a choice has two or more reasonable options with different trade-offs that the docs do not settle;
- the acceptance evidence cannot be produced.

Procedure: leave the code as it is, append an entry to `DECISIONS.md` from its template, ask the
owner the one question (recommendation first), and note the decision id on the issue. When it is
answered, record the resolution in `DECISIONS.md` and fix the spec it changes.

## Review checklist

- [ ] Every acceptance line of the issue passes, shown with real output.
- [ ] No new market, competition or trend claim in code or copy without an evidence path. Fewer
      sources give an honest completeness output, not filler.
- [ ] No raw third-party usernames stored. No secrets in code, env examples or logs.
- [ ] Scores ship with confidence and their counts. Facts, interpretation and suggestions stay in
      separate, labelled layers.
- [ ] A migration applies cleanly and `SCHEMA.md` matches it.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` are green.
- [ ] The specs changed by the work are updated in the same commit.

## File map

| File | Holds |
|---|---|
| `EVIDENCE-CONTRACT.md` | The anti-hallucination rules and the five QC rules. Binding on all work. |
| `PIPELINE-SCORING.md` | Run lifecycle, the Deep pipeline, the score formula. |
| `SCHEMA.md` | Tables, RLS and invariants, with the migration each section came from. |
| `ADAPTERS.md` | The `SourceAdapter` interface, source tiers and adapter rules. |
| `AI-ROUTER.md` | The model-agnostic AI layer, task tiers, batching, hosting modes. |
| `UX-SPEC.md` | Navigation, pages and what each must show. |
| `STACK.md` | The locked stack with the versions that were verified. |
| `ENV.md` | Every environment variable, where it is set and how it is rotated. |
| `DECISIONS.md` | The decision log, append-only. Where reality differed from the plan. |
| `research/` | The competitor sweep, the PDFMinter teardown and the score calibration data. |

## The MVP gate

A niche in (the reference run is `pc troubleshooting`) gives a report with up to 25 distinct PDF
opportunities, limited by evidence and never padded. Each carries evidence of real problems,
buyer intent, trend signals, competition, gaps, a recommended format, source links and a
confidence level, at close to zero cost per run.

Out of scope until after the MVP (PRD §50): TikTok, social sentiment, automatic email alerts,
purchasing data, a large historical database, teams, a mobile app, automatic PDF generation.

## History

Until 2026-11-16 the plan was kept here as `STATE.md`, a master plan, one file per phase and one
log per part. Every part that was open then is an issue now, and the finished ones are in git:

```bash
git show 941c52f:docs/STATE.md
git show 941c52f:docs/log/part-4.1.md
git show 941c52f:docs/phases/phase-6-hardening.md
```

`Part N.M` in a code comment or a spec names a unit of that plan; `git log --grep "phase-N-part-M"`
finds its commit.
