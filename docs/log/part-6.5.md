# Part 6.5 — YouTube adapter: no template comments; clean stored fakes

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-014. Task 1 and the `yt_fallback_*` cleanup: commit 1341ac0 (PR #6, on master via PR #9; details under Blockers / deferred). Recount 2026-11-10 through PostgREST: 0 signals with `external_id like 'yt_fallback_%'`, 0 signals and 0 evidence rows with the template video URL. `B0CT1Trouble` (not a valid ASIN): 1 `competitors` row (a776fc8b, market "Gaming & System Performance Optimization") and 1 `evidence` row (87ce6204) deleted with the user's yes; recount 0 and 0, the market keeps 3 competitors. Grep report (`fallback|mock|seeded|fixture|sample|placeholder|dummy|hard-coded` in `lib`, `app`, `components`, tests excluded): one invented value found and removed, the overview's "Customer intent statement" quote for a signal with no text (`lib/search/overview.ts`; such rows are now skipped, and the brief loader's guards for it and for the deleted `gap-format-friction` gap are gone). Everything else is legitimate: provider fallback in `lib/ai/router.ts`, Reddit's public-JSON fallback, labeled `__fixtures__` JSON used only by tests, input placeholders, and `sample*` field names holding observed rows. Still invented but owned elsewhere: report-page copy (6.14). 273/273 tests (two cover the textless-row skip, PR #10 review), lint, typecheck green. Note: the Supabase MCP SQL endpoint timed out all session (project status ACTIVE_HEALTHY), so counts and deletes went through the project's REST API.

- YouTube template signals (fixed 2026-11-06, evidence-contract breach found in Part 3.10): with no
  `YOUTUBE_API_KEY` the YouTube adapter returned five hard-coded comments as signals
  (`yt_fallback_*`, video dQw4w9WgXcQ). It now throws `SourceNotConfiguredError` (ingest reports
  `skipped`) and `healthCheck()` reports ok:false, like web/etsy/gumroad/kdp; the unit test asserts the
  skip and that nothing is fetched. With the user's OK, one transaction on the live DB deleted the
  5 signals (cascade: 5 `signal_analysis`, 9 `market_signals`), the 9 budgeting markets whose only
  signal was a template row (cascade: their 14 opportunities), and 37 `evidence` rows (12 citing the
  template URLs, including 3 PC-repair "competition" gap claims; 9 market trend rows; 16 opportunity
  rows). Re-check: 0 rows left with the template ids or URLs, 0 orphaned analysis rows; 651 signals,
  48 markets, 66 opportunities remain. The brief loader's `isTemplateRow` shortcut is removed.
  260/260 tests, lint, typecheck, `next build` green.
