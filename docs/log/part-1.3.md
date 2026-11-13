# Part 1.3 — AI extraction via AIRouter

Notes moved verbatim from `docs/STATE.md` on 2026-11-13 (Part 6.13).

AIRouter (providers: ollama, openrouter, openai-compatible), schema validator, runExtractionJob, POST /api/extract; 53/53 tests pass, lint+typecheck+build green. Live acceptance: 25/25 stored signals extracted via OpenRouter (nex-agi/nex-n2.5-pro:free, cost $0), 25 upserted to signal_analysis, 0 failures, intent/urgency/pdf_relevance validated and spot-checked against PRD §14 ladder.
