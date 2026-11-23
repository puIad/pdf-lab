# PIPELINE, LIFECYCLE & SCORING (PRD §16, §38–§39, §52–§55)

## Research-run lifecycle (PRD §38) — normative state machine

```text
QUEUED → COLLECTING → NORMALIZING → CLASSIFYING → CLUSTERING → TREND_ANALYSIS
  → COMPETITION_ANALYSIS → OPPORTUNITY_GENERATION → REPORT_GENERATION → COMPLETED
   (any state → FAILED with error + partial-evidence pointer)
```

- `research_runs.status` holds lowercase form. UI MUST expose progress (PRD §38-final).
- Each transition writes evidence/counts; a run that reaches COMPLETED without stored
  evidence rows is a bug, not a success.
- CLASSIFYING → FAILED when fewer than half of the run's discussion signals end up analysed
  (`MIN_ANALYZED_SHARE` in `lib/runs/orchestrator.ts`, Part 6.9). Above that share the run goes
  on and is marked partial: the trace and the completeness panel give analysed, not analysed and
  "in no market" counts.
- Pasted run (Part 6.15, DEC-015): the same states in two requests. `POST /api/deep` stops in
  CLASSIFYING and returns one prompt of stored signal text; `POST /api/deep/<runId>` takes the
  pasted reply, validates each item, stores the analyses (`prompt_version = extract-v3-paste`)
  and runs CLUSTERING to COMPLETED. Markets are the reply's market names, not embedding
  clusters; a signal the reply marks `none` is in no market. PDF Lab calls no model. A signal an
  earlier run analysed keeps that analysis and its embedding, as in a model run; the reply only
  names its market (issue #40).

- Background run (issue #24, DEC-001): `POST /api/runs`, `POST /api/research` (Deep) and the reply
  to `POST /api/deep/<runId>` return at once (202) and a Vercel Workflow (`workflows/deep-run.ts`)
  carries the run to COMPLETED or FAILED, with the tab open or not. The steps are: collect
  (COLLECTING to CLASSIFYING, lists the signals without an analysis), extract in slices of 20
  signals (each step reads its ids from `run_signals`, so it is resumable and skips analysed
  ones), then finish (CLUSTERING to COMPLETED, one step; its state is rebuilt from the database).
  A pasted run skips collect and extract: the reply route stores the analyses, claims the run
  (`classifying` to `clustering`, so a second reply gets 409) and starts the finish step.
  Progress is `GET /api/runs/<id>`: status, completeness, work figures and, for a failed run, the
  reason (`research_runs.plan.error`). A step is cut off after 4 minutes (`DEEP_STEP_TIMEOUT_MS`
  shortens it); the cut-off aborts an `AbortSignal` that ingest and extraction check before every
  write, so a timed-out step writes nothing after the failure.

## Deep-research pipeline (PRD §39) — the 9 phases every `pdf-lab <niche>` run executes

1. Candidate generation — broad candidate submarkets for the niche.
2. Evidence collection — multi-source search (adapters from `ADAPTERS.md`).
3. Signal extraction — pain/intent/audience/urgency/pdf_relevance per signal (§13–§14).
4. Trend calculation — compare 7d / 30d / 90d+12m windows (§22–§23).
5. Competition — find existing PDF products (§20).
6. Market gaps: the stored Reddit and YouTube signals on the market's topic (the market's own signals plus any other of the run matched like a listing, `discussionForMarket`) are mined for unmet needs (§21). Listings carry no review text, so each gap is labelled buyer discussion, not reviews of the listings (DEC-018); the opportunity page also lists the listings with no review text.
7. Opportunity generation — 50 candidates → 25 distinct (§29).
   Candidates with the same audience and a near-identical problem (token overlap 0.6) merge into the best-scoring one across markets and formats (issue #70, counted as `opportunitiesMergedSimilar`). An opportunity whose evidence is only quick-idea phrase rows says so on the market list and the opportunity page. Quick ideas join the pool as at most one opportunity per market, citing every phrase found in it, and a phrase-only score is capped one below the lowest evidenced score (issue #85) and its confidence at the lowest evidenced confidence (issue #100). A signal whose analysed problem names no concrete problem yields no opportunity: it says so itself ("No specific PC fault is described", "no single fault is named", "without saying what the issue is") or has no content word left after advice vocabulary, vague qualifiers and generic niche nouns are removed ("guidance on troubleshooting common computer problems") (issues #88, #94).
8. Evidence-backed ranking — score + confidence + evidence_count (§16).
9. Final report — human-readable research page (§19, §47).

## First MVP algorithm (PRD §52) — normative until Phase 6

```text
INPUT niche → 50 candidate problems → search web+Reddit each → collect evidence
→ dedup → cluster → compute frequency|recency|trend|buyer-intent|pdf-suitability|competition
→ 50 opportunities → select 25 distinct → report
```

## Opportunity score (PRD §16) — concept formula + storage rule

```text
score = Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability
```

Part 6.11 (`lib/scoring/scoring.ts`): the score is a rule-based index, not a measurement.

- **Demand (0..100)** comes from four observed quantities that do not grow with the fetch limit:
  the median reactions of a discussion (only the engagement keys named per source in
  `lib/sources/engagement.ts`), the highest Google Trends interest among the market's Trends rows,
  the share of question phrasings, and the number of source types (capped at 3). Weights 35 / 35 /
  15 / 15. Engagement and Trends are left out when not observed, never counted as zero. The result
  is scaled by min(1, linked signals / 5): shares and medians of one or two rows are not a market
  (defect #60: one viral question post scored 67 against 63 for an 18-signal market; it now scores
  at most 17: sources cap at 1/3 for one signal). A lone signal can still beat a large market whose own
  engagement, questions and sources are weaker; the cap bounds it, it does not rank by size.
- **ProblemFrequency** is the market's share of the run's clustered signals (1.0 at 25 %).
- **BuyerIntent** is the mean over analysed signals only, reported with "n analysed of m". No
  analysed signal means intent is not observed and the score is 0.
- **TrendMomentum** uses a trend read from observed Trends rows (rising, falling, present, or
  none = unknown) and validated under QC Rule 2 before it is stored.
- **CompetitiveDensity was removed.** It was never fed and always 1. Competition is shown as raw
  stored listing counts (DEC-010), not folded into the score.
- UI order: the raw counts first, the index second and labeled as rule-based.
- Weights and thresholds are `shortcut:` guesses until calibrated; see
  `docs/research/2026-11-13-score-calibration.md`.

- Never display as pseudo-science: ALWAYS store/show the triple
  `{ opportunity_score, confidence (0..1), evidence_count }`.
- No "High demand" string without the counts behind it (PRD §53 Rule 4).
- Trend labels restricted to `emerging|accelerating|seasonal|stable|declining|unknown`
  with temporal evidence attached (PRD §23, §53 Rule 2).

## Quality-control rules (PRD §53) — enforced in code from Phase 1 Part 1.5

1. No opportunity without evidence.
2. No trend claim without temporal evidence.
3. No competition claim without observed competitors.
   Listings are placed per market by title overlap; a listing about something else is dropped and
   counted in `plan.work.listingsDropped` (issue #72).

4. No "high demand" from AI opinion alone.
5. Separate observed facts vs AI interpretation vs product suggestion — in schema
   (`evidence` vs analysis fields vs `opportunities.solution`) AND in UI.

**Run cost (issue #72).** Each run stores `plan.work` on `research_runs`: adapter calls, extraction
   model calls, tokens (null when none was metered, as in a pasted run), active milliseconds
   (the wait for a pasted reply excluded) and dropped listings. `GET /api/runs/<id>` returns it and
   the Deep page shows it. It does not depend on the usage ledger.

## Confidence + completeness display (PRD §54–§55)

- Every conclusion: `Label + Confidence% + Based on N signals over D days from S sources`
  (or `Uncertain + reason`, e.g. insufficient history).
- Every completed run: completeness panel — sources covered, signals analyzed, markets
  identified, opportunities generated, evidence-backed count.
- Completeness % = sources (3 = 20) + signals (20 = 20) + analysed share (20) + markets identified
  (15) + evidence-backed share of opportunities (25) (`lib/runs/completeness.ts`). On one market's
  page the market is always identified, so its 15 are the share of QC rules that hold among those
  with rows to check.
- A market page's panel and the Markdown export list QC Rules 1 to 5 as results on the market's
  stored rows (`marketQcRules` in `lib/report/observed.ts`): what was counted, and whether the rule
  holds, is broken, or has nothing to check. Never a fixed statement that a rule is enforced.

## Scheduled monitoring (Phase 4 Part 4.2, DEC-001, DEC-010)

Vercel Cron calls `GET /api/cron/monitor` once a day (`vercel.json`, 04:47 UTC; `Authorization: Bearer
$CRON_SECRET`, 401 without it). Verified 2026-11-20 against vercel.com/docs/cron-jobs/usage-and-pricing:
Hobby allows 100 cron jobs per project, each at most once a day, fired anywhere in the hour (up to 59
minutes late); an expression that runs more often fails the deployment. One daily call fits, so there is
no mismatch with DEC-001. Each call works the jobs that are due, oldest success first:

- **Tracked seeds** (`watchlists.kind = 'seed'`, one job per seed and region): the same quick-ideas scan as
  `POST /api/ideas`, stored as a dated `seed_snapshots` row. The diff against the snapshots before it
  adds two trend bases to a phrase, each carrying its dates (QC Rule 2): `new` (in no earlier snapshot;
  `firstSeen` and `previousScan`) and `history` (in the latest earlier snapshot, demand moved 10 points or
  more; both dated readings). The first snapshot of a seed is the baseline: nothing in it is called new.
  Watchlist rows show "N new this week", counted from first-seen dates in the last 7 days.
- **Watched markets** (`kind = 'market'`, one job per seed of the market's run): a `monitor` run, as a
  Vercel Workflow (`workflows/monitor-run.ts`): collect the seed's sources, extract only signals that have no
  stored analysis, then build the change report (`change_reports`) against the newest earlier completed run
  of the seed (a Deep or monitor run). No clustering and no new markets. A monitor run never replaces a
  Deep run (`lib/runs/scope.ts` lists `deep` runs only).
- **Change report** (PRD §44): counts of discussions, analysed discussions, strong or very strong buyer
  intent, discussions naming a problem, and competitors (marketplace listings), each from the run's
  `run_signals`. For every count `delta = added - removed`, where added and removed are signals in only
  one of the two runs, so a delta can be checked against stored rows (`reconciles()`). New discussions
  without an analysis (no model key, or extraction failed) are counted and named, never guessed.
- A watched market follows its seed: the page shows the same-named market of the seed's newest Deep run,
  or "not in the newest run" (`lib/monitor/follow.ts`).

**Missed-run backoff** (`afterRun` in `lib/monitor/diff.ts`, state in `monitor_jobs`):

| Situation | What happens |
|---|---|
| Job ran fine | Due again 20 h later, so a daily call that fires up to 59 min late is never skipped or doubled. |
| The cron did not fire (outage, paused deployment) | Nothing is replayed. The job is still due, so the next call runs it once; the snapshot dates show the gap. |
| A call has more due jobs than its budget (10 seed scans, 5 market runs, 240 s) | Oldest success first; the rest stay due for the next call. |
| A scan stored no phrase signals, or a run failed | Failure 1 retries at the next daily call, then after 2, 4 and at most 7 days. A success resets it. |
| `?force=1` | Ignores due times and backoff, for a manual re-run (needs the same bearer secret). |
