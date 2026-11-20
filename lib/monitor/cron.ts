// lib/monitor/cron.ts: what the daily Vercel Cron call does (Phase 4 Part 4.2, DEC-001).
// Dependencies are injected, so the same code runs against the database in production and against
// an in-memory store in tests. Hobby cron fires once a day (+0 to 59 min), so each call works the
// jobs that are due, oldest first, inside a time and count budget; the rest wait for the next call.

import { buildIdeas } from "../ideas/ideas.ts";
import type { MarketSignal } from "../sources/types.ts";
import { afterRun, diffSnapshots, isDue, marketJobKey, normalizeSeed, seedJobKey, toSnapshotPhrases } from "./diff.ts";
import { seedAlerts, type AlertStore } from "../alerts/alerts.ts";
import type { MonitorStore, PhraseChange } from "./types.ts";

export const MAX_SEED_SCANS = 10;
export const MAX_MARKET_RUNS = 5;
export const BUDGET_MS = 240_000; // under the route's 300 s (Hobby function limit)

export interface CronDeps {
  store: MonitorStore;
  /** One quick-ideas scan: the stored phrase signals of a seed in a region. */
  scan(seed: string, region: string): Promise<MarketSignal[]>;
  /** Starts the background re-run of a market's seed; returns the run id. */
  startMarketRun(seed: string): Promise<string>;
  /** Part 4.3: where threshold crossings become in-app alerts. Optional; a failure here never fails a scan. */
  alerts?: AlertStore;
  now?: () => Date;
  force?: boolean;
  budgetMs?: number;
}

export interface CronResult {
  seedScans: Array<{ seed: string; region: string; status: "ok" | "failed"; phrases: number; changes: PhraseChange[]; error?: string }>;
  marketRuns: Array<{ seed: string; status: "started" | "failed"; runId?: string; error?: string }>;
  /** Jobs left for the next call: not yet due, or beyond this call's budget. */
  skipped: Array<{ key: string; reason: "not due" | "budget" }>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runMonitorCron(deps: CronDeps): Promise<CronResult> {
  const { store } = deps;
  const clock = deps.now ?? (() => new Date());
  const started = Date.now();
  const budget = deps.budgetMs ?? BUDGET_MS;
  const result: CronResult = { seedScans: [], marketRuns: [], skipped: [] };
  const targets = await store.watchTargets();

  const due = async <T>(items: T[], keyOf: (t: T) => string, max: number): Promise<Array<{ t: T; job: Awaited<ReturnType<typeof store.getJob>> }>> => {
    const rows = await Promise.all(items.map(async (t) => ({ t, job: await store.getJob(keyOf(t)) })));
    const ready = rows.filter((r) => isDue(r.job, clock(), deps.force));
    for (const r of rows) if (!ready.includes(r)) result.skipped.push({ key: keyOf(r.t), reason: "not due" });
    // Oldest success first (never-run first): a missed day is caught up in order, without a burst.
    ready.sort((a, b) => (a.job?.lastOkAt ?? "").localeCompare(b.job?.lastOkAt ?? ""));
    for (const r of ready.slice(max)) result.skipped.push({ key: keyOf(r.t), reason: "budget" });
    return ready.slice(0, max);
  };

  for (const { t: { seed, region }, job } of await due(targets.seeds, (s) => seedJobKey(s.seed, s.region), MAX_SEED_SCANS)) {
    const key = seedJobKey(seed, region);
    if (Date.now() - started > budget) {
      result.skipped.push({ key, reason: "budget" });
      continue;
    }
    try {
      const signals = await deps.scan(seed, region);
      const ideas = buildIdeas(seed, signals);
      const snapshot = { seed: normalizeSeed(seed), region, scannedAt: clock().toISOString(), phrases: toSnapshotPhrases(ideas.ideas) };
      // No stored phrase evidence is a failed scan, not an empty snapshot that would make the next one all `new`.
      if (snapshot.phrases.length === 0) throw new Error("the scan stored no phrase signals");
      const earlier = await store.snapshots(snapshot.seed, region);
      const changes = diffSnapshots(earlier, snapshot);
      await store.saveSnapshot(snapshot);
      if (deps.alerts) {
        try {
          await deps.alerts.addAlerts(seedAlerts(await deps.alerts.seedWatchers(snapshot.seed, region), earlier[earlier.length - 1], snapshot));
        } catch (err) {
          console.error("alerts: could not write seed alerts", err); // e.g. migration 20 not applied yet
        }
      }
      await store.saveJob(afterRun(job, key, clock(), null));
      result.seedScans.push({ seed: snapshot.seed, region, status: "ok", phrases: snapshot.phrases.length, changes });
    } catch (err) {
      await store.saveJob(afterRun(job, key, clock(), msg(err)));
      result.seedScans.push({ seed, region, status: "failed", phrases: 0, changes: [], error: msg(err) });
    }
  }

  for (const { t: seed, job } of await due(targets.marketSeeds, marketJobKey, MAX_MARKET_RUNS)) {
    const key = marketJobKey(seed);
    try {
      const runId = await deps.startMarketRun(seed);
      // Counted as ok at start so the next call does not start it twice; a failed workflow reports its own failure.
      await store.saveJob(afterRun(job, key, clock(), null));
      result.marketRuns.push({ seed, status: "started", runId });
    } catch (err) {
      await store.saveJob(afterRun(job, key, clock(), msg(err)));
      result.marketRuns.push({ seed, status: "failed", error: msg(err) });
    }
  }
  return result;
}
