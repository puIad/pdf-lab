import { test } from "node:test";
import assert from "node:assert/strict";
import type { MarketSignal } from "../sources/types.ts";
import type { StoredSignalForRun } from "../runs/orchestrator.ts";
import { afterRun, buildChangeReport, countsOf, diffSnapshots, followedMarketIds, isDue, newThisWeek, reconciles, seedJobKey, marketJobKey } from "./diff.ts";
import { runMonitorCron } from "./cron.ts";
import { followMarket } from "./follow.ts";
import type { ChangeReport, Job, MonitorStore, SeedSnapshot } from "./types.ts";

// ---- in-memory store ---------------------------------------------------------------------------
export function memoryStore(targets = { seeds: [{ seed: "meal prep", region: "us" }], marketSeeds: ["budgeting"] }) {
  const jobs = new Map<string, Job>();
  const snaps: SeedSnapshot[] = [];
  const reports: ChangeReport[] = [];
  const store: MonitorStore = {
    watchTargets: async () => targets,
    getJob: async (k) => jobs.get(k) ?? null,
    saveJob: async (j) => void jobs.set(j.key, j),
    snapshots: async (seed, region) => snaps.filter((s) => s.seed === seed && s.region === region).sort((a, b) => a.scannedAt.localeCompare(b.scannedAt)),
    saveSnapshot: async (s) => void snaps.push(s),
    saveReport: async (r) => void reports.push(r),
    reports: async () => [...reports].reverse(),
  };
  return { store, jobs, snaps, reports };
}

const phraseSignal = (phrase: string, count = 4): MarketSignal => ({
  source: "web",
  source_id: `serp:${phrase}`,
  url: null,
  title: phrase,
  text: phrase,
  author: null,
  timestamp: null,
  engagement: { phrase, serp_blocks: "paa", block_count: count, blocks_total: 4, best_position: 0 },
  market_candidates: [],
  intent: null,
  pain_points: [],
});

const sig = (id: string, o: Partial<StoredSignalForRun> = {}): StoredSignalForRun => ({ id, title: id, content: id, url: `https://x/${id}`, source_id: "s", source_type: "reddit", ...o });
const analysed = (id: string, intent: string, problem = "p"): StoredSignalForRun =>
  sig(id, { analysis: { id: `a${id}`, audience: "a", problem, intent, urgency: "low", pdf_relevance: 0.5, embedding: null } });

test("change report deltas reconcile to the stored counts", () => {
  const baseline = [analysed("1", "strong"), analysed("2", "weak"), sig("3", { source_type: "etsy" }), sig("4")];
  const current = [analysed("1", "strong"), analysed("2", "weak"), analysed("5", "very_strong"), sig("6", { source_type: "etsy" }), sig("7", { source_type: "etsy" }), sig("8")];
  const r = buildChangeReport({ seed: "s", runId: "r2", createdAt: "2026-11-21T00:00:00Z", current, baseline: { runId: "r1", at: "2026-11-20T00:00:00Z", signals: baseline } });
  assert.deepEqual(r.baseline, countsOf(baseline));
  assert.deepEqual(r.current, countsOf(current));
  assert.equal(r.deltas!.discussions, 1);
  assert.equal(r.deltas!.competitors, 1);
  assert.equal(r.added!.competitors, 2);
  assert.equal(r.removed!.competitors, 1);
  assert.equal(r.deltas!.buyerIntent, 1);
  assert.ok(reconciles(r));
  assert.equal(r.unanalysedNew, 1); // signal 8
  assert.equal(r.newItems.filter((i) => i.kind === "product").length, 2);
});

test("a first reading has no deltas", () => {
  const r = buildChangeReport({ seed: "s", runId: "r1", createdAt: "x", current: [sig("1")], baseline: null });
  assert.equal(r.deltas, null);
  assert.equal(r.current.discussions, 1);
});

test("seed diff: first snapshot has nothing new; later phrases are new with dates; demand moves are history", () => {
  const a: SeedSnapshot = { seed: "meal prep", region: "us", scannedAt: "2026-11-10T04:00:00Z", phrases: [{ phrase: "meal prep plan", demand: 50, opportunity: 60, trend: null }] };
  assert.deepEqual(diffSnapshots([], a), []);
  const b: SeedSnapshot = {
    ...a,
    scannedAt: "2026-11-20T04:00:00Z",
    phrases: [
      { phrase: "meal prep plan", demand: 70, opportunity: 60, trend: null },
      { phrase: "meal prep for two", demand: 40, opportunity: 50, trend: null },
    ],
  };
  const ch = diffSnapshots([a], b);
  const n = ch.find((c) => c.basis === "new");
  const h = ch.find((c) => c.basis === "history");
  assert.equal(n?.basis === "new" && n.phrase, "meal prep for two");
  assert.equal(n?.basis === "new" && n.firstSeen, "2026-11-20T04:00:00Z");
  assert.ok(h?.basis === "history" && h.from.at === a.scannedAt && h.to.at === b.scannedAt && h.from.demand === 50 && h.to.demand === 70);
  const w = newThisWeek([a, b], new Date("2026-11-22T00:00:00Z"));
  assert.equal(w.count, 1);
  assert.equal(newThisWeek([a, b], new Date("2026-12-30T00:00:00Z")).count, 0);
});

test("forced seed re-scan marks injected phrases new, with dates", async () => {
  const { store, snaps } = memoryStore({ seeds: [{ seed: "meal prep", region: "us" }], marketSeeds: [] });
  let day = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 18 + day, 4));
  const base = [phraseSignal("meal prep plan"), phraseSignal("meal prep for beginners")];
  const run = (signals: MarketSignal[], force = false) => runMonitorCron({ store, scan: async () => signals, startMarketRun: async () => "run", now: clock, force });
  const first = await run(base);
  assert.equal(first.seedScans[0].changes.length, 0);
  assert.equal((await run(base)).skipped[0].reason, "not due"); // same day: not due, so no second scan
  day = 1;
  const injected = [...base, phraseSignal("meal prep for gym bros"), phraseSignal("meal prep keto week")];
  const second = await run(injected, true); // forced: ignores due times
  const news = second.seedScans[0].changes.flatMap((c) => (c.basis === "new" ? [c] : []));
  assert.deepEqual(news.map((c) => c.phrase).sort(), ["meal prep for gym bros", "meal prep keto week"]);
  assert.ok(news.every((c) => c.firstSeen === snaps[1].scannedAt && c.previousScan === snaps[0].scannedAt));
});

test("backoff: failures retry next day, then 2, 4, 7 days; success resets; a missed day is just due", () => {
  const now = new Date("2026-11-20T04:00:00Z");
  const k = seedJobKey("Meal  Prep", "us");
  assert.equal(k, "seed|us|meal prep");
  let j = afterRun(null, k, now, "boom");
  assert.equal(j.failures, 1);
  assert.equal(new Date(j.nextDueAt!).getTime() - now.getTime(), 20 * 3_600_000);
  j = afterRun(j, k, now, "boom");
  assert.equal(new Date(j.nextDueAt!).getTime() - now.getTime(), 44 * 3_600_000);
  j = afterRun(j, k, now, "boom");
  j = afterRun(j, k, now, "boom");
  j = afterRun(j, k, now, "boom");
  assert.equal(new Date(j.nextDueAt!).getTime() - now.getTime(), (7 * 24 - 4) * 3_600_000);
  assert.equal(afterRun(j, k, now, null).failures, 0);
  assert.equal(isDue(j, now), false);
  assert.equal(isDue(j, now, true), true);
  assert.equal(isDue(null, now), true);
  assert.equal(marketJobKey(" Budgeting "), "market|budgeting");
});

test("cron: a failing scan backs the job off, a market seed starts one run, budget leaves the rest", async () => {
  const { store, jobs } = memoryStore({ seeds: [{ seed: "a b", region: "us" }, { seed: "c d", region: "us" }], marketSeeds: ["budgeting"] });
  const started: string[] = [];
  const r = await runMonitorCron({
    store,
    scan: async (seed) => {
      if (seed === "a b") throw new Error("serper 429");
      return [phraseSignal("c d plan")];
    },
    startMarketRun: async (s) => (started.push(s), "run-1"),
  });
  assert.equal(r.seedScans.find((s) => s.seed === "a b")?.status, "failed");
  assert.equal(jobs.get("seed|us|a b")?.failures, 1);
  assert.equal(r.marketRuns[0].runId, "run-1");
  assert.deepEqual(started, ["budgeting"]);
  const again = await runMonitorCron({ store, scan: async () => [], startMarketRun: async () => "x" });
  assert.equal(again.seedScans.length + again.marketRuns.length, 0); // nothing due yet
  const limited = await runMonitorCron({ store, scan: async () => [phraseSignal("c d plan")], startMarketRun: async () => "x", force: true, budgetMs: -1 });
  assert.ok(limited.skipped.some((s) => s.reason === "budget"));
});

test("a watched market follows its seed to the newest run by name", () => {
  const watched = { id: "m1", name: "Budget Planners", runId: "r1" };
  const latest = [{ id: "m9", name: "budget  planners", runId: "r2" }, { id: "m8", name: "other", runId: "r2" }];
  assert.equal(followMarket(watched, "r2", latest)?.id, "m9");
  assert.equal(followMarket(watched, "r1", [])?.id, "m1");
  assert.equal(followMarket(watched, "r2", [latest[1]]), null);
  assert.equal(followMarket({ ...watched, runId: null }, "r2", latest)?.id, "m1");
});

test("a phrase that reappears is new only once; followed market ids come from the views", () => {
  const snap = (at: string, phrases: string[]): SeedSnapshot => ({ seed: "x", region: "us", scannedAt: at, phrases: phrases.map((phrase) => ({ phrase, demand: 10, opportunity: 10, trend: null })) });
  const w = newThisWeek([snap("2026-11-10T00:00:00Z", ["a"]), snap("2026-11-18T00:00:00Z", ["a", "b"]), snap("2026-11-19T00:00:00Z", ["a"]), snap("2026-11-20T00:00:00Z", ["a", "b"])], new Date("2026-11-21T00:00:00Z"));
  assert.deepEqual(w.phrases, [{ phrase: "b", firstSeen: "2026-11-18T00:00:00Z" }]);
  assert.deepEqual(followedMarketIds({ w1: { market: { id: "m2" } }, w2: { market: null } }), ["m2"]);
});
