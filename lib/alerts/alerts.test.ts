import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { MarketSignal } from "../sources/types.ts";
import { runMonitorCron } from "../monitor/cron.ts";
import type { ChangeReport, Job, MonitorStore, SeedSnapshot } from "../monitor/types.ts";
import { ALERT_CHANNELS, buildDigest, crossings, marketAlerts, parseSettings, seedAlerts, type AlertStore, type NewAlert, type Watcher } from "./alerts.ts";

const snap = (at: string, phrases: Array<[string, number]>): SeedSnapshot => ({
  seed: "meal prep",
  region: "us",
  scannedAt: at,
  phrases: phrases.map(([phrase, opportunity]) => ({ phrase, demand: 50, opportunity, trend: null })),
});
const w = (o: Partial<Watcher> = {}): Watcher => ({ watchId: "w1", userId: "u1", threshold: null, muted: false, ...o });

test("a crossing needs the phrase below the threshold (or absent) before and at or above it now", () => {
  const a = snap("2026-11-18T04:00:00Z", [["stays high", 80], ["rises", 60], ["falls", 90]]);
  const b = snap("2026-11-19T04:00:00Z", [["stays high", 85], ["rises", 72], ["falls", 40], ["brand new", 75], ["new low", 30]]);
  assert.deepEqual(crossings(a, b, 70).map((c) => c.phrase), ["rises", "brand new"]);
  assert.deepEqual(crossings(undefined, b, 70), []); // the first scan is a baseline
});

test("a threshold crossing writes an alert row with both dates; muting and thresholds are per watch", () => {
  const a = snap("2026-11-18T04:00:00Z", [["rises", 60]]);
  const b = snap("2026-11-19T04:00:00Z", [["rises", 72]]);
  const rows = seedAlerts([w()], a, b);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "opportunity");
  assert.equal(rows[0].detail.previousScanAt, a.scannedAt);
  assert.equal(rows[0].detail.scannedAt, b.scannedAt);
  assert.deepEqual(seedAlerts([w({ muted: true })], a, b), []);
  assert.deepEqual(seedAlerts([w({ threshold: 90 })], a, b), []);
  assert.equal(seedAlerts([w({ threshold: 65 })], a, b)[0].detail.threshold, 65);
});

test("cron turns a crossing between two scans into an alert", async () => {
  const snaps: SeedSnapshot[] = [];
  const jobs = new Map<string, Job>();
  const store: MonitorStore = {
    watchTargets: async () => ({ seeds: [{ seed: "meal prep", region: "us" }], marketSeeds: [] }),
    getJob: async (k) => jobs.get(k) ?? null,
    saveJob: async (j) => void jobs.set(j.key, j),
    snapshots: async () => [...snaps],
    saveSnapshot: async (s) => void snaps.push(s),
    saveReport: async () => {},
    reports: async () => [],
  };
  const written = new Map<string, NewAlert>();
  const watchers = [w({ threshold: 20 })];
  const alerts: AlertStore = {
    seedWatchers: async () => watchers,
    marketWatchers: async () => [],
    addAlerts: async (rows) => rows.forEach((r) => written.set(`${r.userId}|${r.dedupe}`, r)),
  };
  const sig = (phrase: string, count: number): MarketSignal => ({
    source: "web", source_id: `serp:${phrase}`, url: null, title: phrase, text: phrase, author: null, timestamp: null,
    engagement: { phrase, serp_blocks: "paa", block_count: count, blocks_total: 4, best_position: 0 },
    market_candidates: [], intent: null, pain_points: [],
  });
  let day = 0;
  const run = (signals: MarketSignal[]) => runMonitorCron({ store, alerts, scan: async () => signals, startMarketRun: async () => "r", force: true, now: () => new Date(Date.UTC(2026, 10, 18 + day, 4)) });
  await run([sig("meal prep plan", 1)]);
  assert.equal(written.size, 0);
  day = 1;
  await run([sig("meal prep plan", 1), sig("meal prep for gym", 4)]);
  assert.ok([...written.values()].some((r) => r.detail.phrase === "meal prep for gym"));
});

const report = (added: number, o: Partial<ChangeReport> = {}): ChangeReport => ({
  seed: "budgeting", runId: "r2", baselineRunId: "r1", createdAt: "2026-11-20T05:00:00Z", baselineAt: "2026-11-19T05:00:00Z",
  current: { discussions: 0, analysed: 0, buyerIntent: 0, complaints: 0, competitors: 0 }, baseline: null, deltas: null,
  added: { discussions: 0, analysed: 0, buyerIntent: added, complaints: 1, competitors: 2 }, removed: null, newItems: [], unanalysedNew: 0, note: null, ...o,
});

test("market alerts need a baseline and enough new buyer-intent signals", () => {
  const mw = [{ ...w(), marketId: "m1" }];
  assert.equal(marketAlerts(mw, report(3)).length, 1);
  assert.equal(marketAlerts(mw, report(2)).length, 0);
  assert.equal(marketAlerts(mw, report(5, { baselineAt: null })).length, 0);
  assert.equal(marketAlerts([{ ...mw[0], muted: true }], report(9)).length, 0);
});

test("digest counts reconcile to the snapshot rows and the stored reports, all dated", () => {
  const now = new Date("2026-11-21T00:00:00Z");
  const snaps = [snap("2026-11-10T04:00:00Z", [["a", 1]]), snap("2026-11-18T04:00:00Z", [["a", 1], ["b", 1]]), snap("2026-11-20T04:00:00Z", [["a", 1], ["b", 1], ["c", 1]])];
  const d = buildDigest(
    [{ watchId: "w1", seed: "meal prep", region: "us", snapshots: snaps }],
    [{ watchId: "w2", seed: "budgeting", marketId: "m1", reports: [report(4), report(1, { runId: "r0", createdAt: "2026-11-01T00:00:00Z" })] }],
    now,
  );
  const newPhrases = new Set(snaps.slice(1).flatMap((s) => s.phrases.map((p) => p.phrase)).filter((p) => !snaps[0].phrases.some((q) => q.phrase === p)));
  assert.equal(d.newIdeas, newPhrases.size);
  assert.equal(d.newIdeas, 2);
  assert.ok(d.seeds[0].phrases.every((p) => snaps.some((s) => s.scannedAt === p.firstSeen)));
  assert.equal(d.markets[0].runs, 1); // the report from 1 Nov is outside the week
  assert.equal(d.markets[0].added.buyerIntent, 4);
});

test("settings requests are validated", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseSettings({ watchId: id, muted: true }), { watchId: id, muted: true });
  assert.deepEqual(parseSettings({ watchId: id, threshold: null }), { watchId: id, threshold: null });
  for (const bad of [{ watchId: "x", muted: true }, { watchId: id }, { watchId: id, threshold: 0 }, { watchId: id, threshold: 50.5 }, { watchId: id, muted: "yes" }, null]) {
    assert.ok("error" in parseSettings(bad), JSON.stringify(bad));
  }
});

test("no email or browser alert path is active", () => {
  assert.deepEqual(ALERT_CHANNELS, { inApp: true, email: false, browser: false });
  const code = ["alerts.ts", "supabase-store.ts", "load.ts"].map((f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).join("\n");
  assert.ok(!/nodemailer|resend|sendgrid|postmark|smtp|web-push|Notification\(/i.test(code));
});
