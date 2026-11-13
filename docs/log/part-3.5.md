# Part 3.5 — Keyless discovery adapters (local-only autocomplete + Wikipedia)

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

10 unit tests; 186/186 tests, lint, typecheck, build green 2026-10-24. Live (no DB): autocomplete 5/5 engines answered, 50 phrases for "keto diet" and "budgeting" in ~15 s; Wikipedia matched "Intermittent fasting" (-16%) and "Budget" (+21%), honestly found no article for "keto diet" / "toddler sleep". Live DB acceptance after DEC-009 resolved: runIngest "budgeting" → autocomplete 50 inserted, wikipedia 1 inserted; rerun 0 inserted / 51 duplicates; flag off → autocomplete `skipped`; DB count: 50 autocomplete + 1 wikipedia signals, one `sources` row each (the wikipedia row was created by a connectivity check, same values the pipeline auto-inserts). Note: Deep runs without `source_keys` now also ingest Wikipedia, and autocomplete when the local flag is on.
