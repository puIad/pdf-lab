# Part 1.1 — Adapter interface + registry + Reddit adapter

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

Types+registry exact per 08-ADAPTERS; Reddit adapter (OAuth app-only + public fallback, sha256 authors, throttle/backoff/cache, healthCheck); GET /api/sources/health; fixture + 11 unit tests green (stub content-type fix this turn); lint+typecheck+build green 2026-09-17. Live acceptance via Composio-OAuth dev harness (DEC-006): 10 deduped `signals` rows source `reddit` (`pc troubleshooting`), leaks:none, rerun dedup proven (count stays 10). Prod collect() still awaits own app-id (DEC-005 approval); zero code change when it lands.
