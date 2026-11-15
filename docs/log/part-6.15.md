# Part 6.15 — Deep runs analysed by a pasted model reply

Branch `phase-6-part-6.15`. Spec: `docs/phases/phase-6-hardening.md`, Part 6.15. Context: DEC-015
(no chat model answers through the router, so no Deep run completed).

## What was built

A Deep run in two requests, with no model call inside PDF Lab.

1. `POST /api/deep { seed }` collects the seed's signals, stops the run in `classifying` and
   returns one prompt. The prompt holds only stored signal text (title and content, 1000
   characters per signal), numbered `[1]` to `[n]` in a fixed order (by signal id), plus the
   extraction field rules shared with the router prompt (`FIELD_RULES`, `GROUNDING_RULE`) and
   one extra key, `market`: a short name for the problem area, or `none` for a signal that names
   no problem within the topic.
2. The user pastes the prompt into a chat model and pastes its JSON reply into
   `POST /api/deep/<runId> { reply }`. `parsePastedReply` reads JSON inside a code block or
   prose, validates every item alone with `validateExtraction`, and lists wrong and missing
   items. Under half valid: 422, nothing stored, the run keeps waiting. Otherwise the valid
   analyses are stored with `prompt_version = extract-v3-paste` and the run finishes: signals are
   grouped by the reply's market names (case and punctuation ignored), each group is scored by
   the same `summarizeCluster` as a model run, and opportunities come from the observed pool
   only (the generator gets no router).
3. `GET /api/deep/<runId>` returns the run's state and, while it waits, the same prompt again.
4. Page `/deep`: three steps (collect, copy the prompt, paste the reply). The run id sits in
   `?run=`, so a reload or a trip to the model's tab keeps the run. The "Deep research" buttons
   on the explorer and on a scanned seed in `/ideas` now link to it. The old dialog posted to
   `/api/runs` without a key and always got 401; it is gone.

Code: `lib/runs/pasted.ts` (prompt, reply parser, grouping), `lib/runs/pasted-run.ts` (server
read shared by the routes and the page), `lib/runs/orchestrator.ts` (split into `openRun`,
`collectSignals`, `finishRun`, `failRun`; `executeResearchRun` keeps its behaviour; new
`startPastedRun` and `finishPastedRun`), `lib/runs/service-deps.ts` (`marketLabels` option),
`components/ui/textarea.tsx` (new primitive, same surface as `Input`).

Changed for every run: the "analysed but not clustered (no embedding)" count became "analysed
but in no market" (`signalsNotClustered`). It is counted from the market links, so it covers a
signal with no embedding and a signal the reply marked `none`.

## Verification (2026-11-15)

- `pnpm typecheck`, `eslint` on the touched files, `next build`: green. `pnpm test`: 336 of 336
  (`lib/runs/pasted.test.ts` is new: prompt order and cap, reply parsing, grouping, the two
  requests against fake deps, and the one-request model run through the same phases).
- Live run on the real DB, seed "meal prep", run `c638c48d-7d5c-424a-9012-7e788705479d`. The
  reply was written by the agent in the session from the prompt's text, not by Gemini.
  - Collect: 200 in 19 s. 34 discussion signals; sources gtrends 25, web 21, etsy 10, gumroad
    10, kdp 10, wikipedia 1; reddit failed; youtube and autocomplete skipped. Prompt 8,823
    characters.
  - A reply with 5 of 34 items: 422, "Only 5 of 34 items are valid", nothing stored, run still
    `classifying`. Text that is not JSON: 400. A run id that is not a uuid: 400. No key on a
    production server: 401. `GET` returned the same prompt, byte for byte, as the first request.
  - Full reply pasted in the page (headless Chrome for Testing): finished in 41 s. The page
    showed 34 of 34 analysed, 8 markets, 25 opportunities, 83 evidence rows, 12 signals in no
    market. "Open this run's markets" led to `/?run=<id>` with 8 rows.
  - Recount with PostgREST: 8 markets (22 linked signals: 6, 5, 3, 3, 2, 1, 1, 1), 34 analyses,
    all `extract-v3-paste`, none with an embedding, 12 analysed signals in no market, 25
    opportunities with 25 distinct titles, each with evidence rows; evidence 76 on markets and
    opportunities plus 7 competition rows on the run id, 83 in total. Equal to
    `GET /api/runs/<id>` completeness (6 sources, 34 / 34, 8, 25, 83, 25 backed, 12 in no market).
  - The 12 signals in no market are 11 unrelated Trends rising queries ("netflix new releases",
    "learn golang", ...) and the search-interest measurement row. None became a market.
  - `/deep` at 375 px: 0 px overflow in the new, waiting and finished states. Console: 0 errors
    apart from the browser's own line for the expected 422.
- The DB also holds three completed pasted runs from 2026-11-14 ("budgeting" twice, "meal prep"
  once), made while the part was being built. They were not re-checked.

## Not verified

- The list of wrong and missing items on `/deep` after a rejected reply was checked through
  the API response only. The page was not looked at in that state.
- "Collect" was not clicked in a browser; the first request was sent with curl.
- Gemini itself was never used. Whether its reply keeps one item per signal and exact market
  names on a long prompt is unknown.

## Observations

1. A pasted run puts every discussion signal of the seed in the prompt, including ones an
   earlier run analysed. Their stored analysis is replaced and their embedding is cleared (the
   model path's upsert clears it too). A later model run embeds them again.
2. The second request took 41 s against `maxDuration = 60` with 34 signals. A larger run can
   time out on Vercel; that belongs with 6.10.
3. Deployed, both routes need `x-api-key` until 5.1, so `/deep` only works on a local dev
   server. The page says so on a 401.
4. Parts 6.7, 6.8 and 6.9 are blocked on DEC-015 for their live acceptance only. A pasted run
   completes, so those checks can now be run this way. They were not run here.
5. `DeepResearchDialog` kept its name and an unused `onSuccess` prop so the call sites did not
   change. It is a link now.
6. The dev server that had been running since 2026-11-14 stopped serving
   `/api/deep/[runId]` after `next build` ran next to it ("Failed to generate static paths",
   worker exceptions). The live check used `next start` on port 3001 with the test key from
   `.claude/launch.json`. Restart `next dev` before using the page.
