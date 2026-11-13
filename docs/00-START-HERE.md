# PDF LAB — START HERE (read this first, every session)

This folder is the project's **single source of truth**. The PRD (`../pdf-lab.md`, 62 sections)
is the *vision*; `docs/` is the *executable plan*. If they conflict on implementation detail,
`docs/` wins and the conflict gets logged in `DECISIONS.md`.

## How to work (the short-prompt contract)

You never need to re-explain the project. A prompt like this is complete:

```text
start phase 2 part 3
```

or

```text
continue — next unfinished part
```

On receiving it, the agent MUST, in this order:

1. Read `docs/00-START-HERE.md` (this file).
2. Read `docs/01-PHILOSOPHY.md` (session protocol).
3. Read `docs/STATE.md` (what is done, what is next, what is blocked, open defects). Open a
   part's log in `docs/log/` only when working on that part or depending on it.
4. Read `docs/02-MASTER-PLAN.md` (where the requested part sits in the DAG).
5. Read the requested phase file in `docs/phases/` (it contains everything else it needs,
   including links to whichever of `docs/03-STACK.md` … `docs/09-UX-SPEC.md` and
   `docs/guides/*` are relevant — follow those links).
6. Do the work, then update `docs/STATE.md`, run the part's review checklist
   (`docs/REVIEW-CHECKLIST.md`), and report.

No step may be skipped. If any listed file is missing or contradictory, STOP and raise a
decision request (see `01-PHILOSOPHY.md` §4) instead of guessing.

## File map

| File | Purpose |
|---|---|
| `00-START-HERE.md` | This file. Load order + short-prompt contract. |
| `01-PHILOSOPHY.md` | Context-persistence philosophy, session protocol, decision-request trigger. |
| `02-MASTER-PLAN.md` | All phases/parts, DAG, dependencies, MVP cut line. |
| `03-STACK.md` | Locked stack, verified versions (Sept 2026), canonical doc links. |
| `04-SCHEMA.md` | Database schema: tables, SQL, pgvector, RLS. |
| `05-PIPELINE-SCORING.md` | Run lifecycle, deep pipeline, opportunity-score formula, QC rules. |
| `06-EVIDENCE-CONTRACT.md` | Anti-hallucination rules. EVERY phase obeys this. |
| `07-AI-ROUTER.md` | Model-agnostic LLM layer, cheap/strong/embed split, BYOK modes. |
| `08-ADAPTERS.md` | SourceAdapter interface + Tier 1/2/3 source specs. |
| `09-UX-SPEC.md` | Dashboard, market page, opportunity detail, explorer, export. |
| `STATE.md` | LIVE tracker: done / in-progress / blocked / next, one line per part, plus open defects. Update every part. |
| `log/part-<N>.<M>.md` | Per-part notes: what was built, how it was verified, observations. Read on demand. |
| `DECISIONS.md` | Decision-request log. Problems stop here, get answered, get recorded. |
| `REVIEW-CHECKLIST.md` | Per-part acceptance + evidence gate. Nothing merges unchecked. |
| `phases/phase-0-foundation.md` … `phases/phase-6-hardening.md` | Self-contained build steps. Each part lists goal, PRD refs, deps, tasks, files, acceptance, review. |
| `guides/*.md` | Per-library, up-to-date install + config instructions with doc links. |

## Status in one glance

- Refreshed 2026-11-13. The app is built through Phase 3 and most of Phase 6 hardening: quick
  ideas → Validate → competition check → brief works end to end; Deep runs are run-scoped,
  batched and evidence-matched but none completes until a chat model is chosen (DEC-015).
- MVP cut line: **PRD §51–§52** — niche in → up to 25 opportunities, limited by evidence, plus
  the market / trend / pain / competition / evidence report, at near-zero cost per run.
- Current position: see `STATE.md`, never this block. If `STATE.md` says an earlier dependency is
  unfinished, start there regardless of which later part is requested (its Deps row will tell you).

## Rules that override everything

1. **Evidence before synthesis** (`06-EVIDENCE-CONTRACT.md`). No market claim without
   stored evidence rows. No exceptions, not even in scaffolding demos (use clearly-labeled fixtures).
2. **Adapter boundary** (`08-ADAPTERS.md`). No source-specific code outside an adapter.
3. **Problem stops work.** Unknown API shape, dead library, cost surprise, PRD ambiguity →
   decision request in `DECISIONS.md`, work halts on that part until answered.
4. **STATE.md is updated in the same turn work finishes.** An unlogged completion didn't happen.
5. **Frontend AI Mega Library.** ALWAYS and ONLY use components, UI primitives, and directing
   prompts from `C:\Users\pulad\Desktop\frontend-ai-megalibrary` for all frontend development,
   UI design, styling, and page components.
