# Part 1.2 — Trends + web-search adapters + ingest

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

DEC-002 resolved: Serper (2.5k free, no card; Brave/Tavily/Bing rejected); gtrends adapter (google-trends-api 4.9.2 pinned, verified live, isolated/24h-cache/graceful) + web adapter (Serper-keyed, honest skipped) + ingest (collect→normalize→dedup→insert, POST /api/ingest per-source counts); 37/37 tests, lint+typecheck+build green 2026-09-17. Live `pc troubleshooting`: gtrends 2 rows, web 8 rows (Composio-Exa harness via real normalize, DEC-006 pattern), reruns dup-proven, reddit still blocked-pending-approval (rows intact: 10/2/8). Prod web needs SERPER_API_KEY (zero code change); prod reddit needs own app-id (DEC-005). SERPER key installed + verified live 2026-09-17 (health ok, 5 fresh rows; restart dev server to pick it up).
