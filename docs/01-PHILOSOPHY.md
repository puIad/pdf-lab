# 01 — PHILOSOPHY: never rewrite context twice

## The problem this system solves

Multi-step builds die when context lives in chat history: every new prompt re-explains the
stack, the schema, the conventions, and what "done" means. This docs system moves ALL of that
into files, so the user's prompt carries only **intent** ("start phase 2 part 3") and the
agent loads **context** from disk.

## The five principles

### 1. Files are memory, chat is intent

- Everything durable lives in `docs/`. Chat holds only the current task and its result.
- The agent MUST re-read the load order in `00-START-HERE.md` at the start of every task,
  even if it "remembers" the project. Memory is unverified; files are truth.
- If a file is wrong, fix the file (and note it in `STATE.md`), don't work around it in chat.

### 2. Every part is self-contained and addressable

- Each implementable unit has an ID: `Phase <N> Part <M>` (e.g. `Phase 2 Part 3`).
- Its phase file contains: goal, PRD references, dependencies, step-by-step tasks,
  files to touch, acceptance criteria, review items, and exact `STATE.md` update.
- Consequence: any part can be started with a one-line prompt, resumed after interruption,
  or delegated, with zero extra explanation.

### 3. State is explicit, not implied

- `STATE.md` tracks per part: `pending | in_progress | blocked | done`, plus commit refs.
- Exactly one part is `in_progress` at a time. It is marked `in_progress` BEFORE work
  starts and `done`/`blocked` AFTER, in the same turn.
- "Done" = code runs + acceptance criteria met + review checklist passed + STATE updated.
  Anything less stays `in_progress` or becomes `blocked`.

### 4. Problems halt and escalate — then become documentation

A **decision request** is triggered IMMEDIATELY when the agent hits any of:

- (a) A library/API does not match the guide (changed API, deprecated package, new pricing).
- (b) A step is ambiguous or contradicts another doc or the PRD.
- (c) A step implies real cost, ToS scraping risk, or credential exposure.
- (d) A choice has ≥2 reasonable options with different trade-offs (e.g. Inngest vs
      Trigger.dev vs cron) that the docs don't already resolve.
- (e) Test/acceptance evidence can't be produced.

Procedure:

1. STOP work on that part (leave code as-is, don't hack around it).
2. Append an entry to `DECISIONS.md` using its template: date, part ID, what was
   expected, what was found, options (with doc links), recommendation, **question for user**.
3. Mark the part `blocked` in `STATE.md` with a pointer to the decision ID.
4. Reply to the user with the question ONLY (short, with recommendation first).
5. When answered, record the resolution in `DECISIONS.md`, update the affected guide/phase
   file so the next reader never hits the same wall, then resume.

The decision log is therefore also the project's record of "where reality differed from plan".

### 5. Review is part of done, not after it

- Every part ends with `docs/REVIEW-CHECKLIST.md`: acceptance re-check, evidence-contract
  check (§6), regression glance (previous parts still pass), STATE update check.
- Phase-level gates (in each phase file's header): a phase is complete only when all its
  parts are `done` AND the gate items pass.
- MVP gate (`02-MASTER-PLAN.md`): one niche in → 25 distinct, evidence-backed opportunities
  out, near-zero cost. Nothing is "MVP complete" until that run is demonstrated end to end.

## Session protocol (normative)

1. Load: `00` → `01` → `STATE.md` → `02-MASTER-PLAN.md` → requested phase file → linked specs/guides.
2. Announce: part ID, goal in one line, deps status (satisfied/blocked).
3. Mark `in_progress` in `STATE.md`.
4. Implement exactly the part's tasks, in order. No scope creep into other parts; spillover
   becomes a note in `STATE.md` ("deferred to Phase X Part Y").
5. On any trigger from §4: escalate, do not improvise.
6. Verify: run the part's acceptance checks for real (commands + outputs, not assertions).
7. Review: `REVIEW-CHECKLIST.md`, record results in the reply.
8. Update `STATE.md` (`done` + commit ref or `blocked` + decision ID) and report concisely:
   what changed, how verified, what's next.

## Commit convention (so history answers "what was already done")

- One part = one commit (amend only for review fixes of the same part).
- Message: `phase-<N>-part-<M>: <imperative summary>` e.g. `phase-1-part-2: add signals tables and pgvector index`.
- The commit hash goes into `STATE.md` next to the part. `git log --oneline` then mirrors the plan.
