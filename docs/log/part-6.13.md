# Part 6.13 — Lighter process docs

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-014. Includes the missing megalibrary path (decision request)

## 2026-11-13: tasks 1 to 3 done, task 4 asked (DEC-016)

- Task 1: every STATE row's notes moved verbatim to `docs/log/part-<N>.<M>.md` (39 files), plus the
  free-standing "3.3 radar fix" paragraph (→ `part-3.3.md`) and the "YouTube template signals"
  bullet (→ `part-6.5.md`). Counts from the move script: 6529 words moved; `STATE.md` went from
  7570 words to 1997 before the convention note; the log files hold 7256 words (the moved text
  plus a three-line header per file). `STATE.md` is 142 lines.
- Task 2: "Open defects" table in STATE with 21 rows seeded from the observations in rows 0.3,
  1.1, 3.4 to 3.10 and 6.4 to 6.14. Fixed ones are left out (seeded radar, template comments, fake
  ASIN, PC gap texts, extraction failures not failing a run, PC prompt examples, price range on the
  first market only). 10 have an owning part or decision, 11 are unowned.
- Task 3: `00-START-HERE.md`, `01-PHILOSOPHY.md` and `AGENTS.md` say: read STATE, open a part log
  only when working on or depending on that part; notes go to the log, defects to the table. The
  stale "Status in one glance" block is refreshed.
- Task 4: the megalibrary folder is still missing. DEC-016 asks where it lives; the path in
  `AGENTS.md` and `00-START-HERE.md` is unchanged until answered.
- Checks: docs only; 316/316 tests, lint and typecheck unchanged from 6.14.
