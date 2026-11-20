// lib/alerts/alerts.ts: in-app alerts and the weekly digest (Phase 4 Part 4.3, PRD §45). Pure: the
// crossings and the digest are computed from rows the caller loaded, so they are unit tested.

import { newThisWeek } from "../monitor/diff.ts";
import type { ChangeReport, SeedSnapshot } from "../monitor/types.ts";

/** Email and browser alerts stay off (PRD §50: no automatic email for the MVP). Nothing sends; there is no sender to enable. */
export const ALERT_CHANNELS = { inApp: true, email: false, browser: false } as const;

export const DEFAULT_SEED_THRESHOLD = 70; // opportunity score, 1 to 100
export const DEFAULT_MARKET_THRESHOLD = 3; // new buyer-intent signals in one re-run

export interface Watcher {
  watchId: string;
  userId: string;
  threshold: number | null;
  muted: boolean;
}

export interface NewAlert {
  userId: string;
  watchId: string;
  kind: "opportunity" | "market_change";
  seed: string;
  region: string;
  title: string;
  detail: Record<string, unknown>;
  dedupe: string;
}

export interface AlertStore {
  /** Watches of a tracked seed in a region, with their settings. */
  seedWatchers(seed: string, region: string): Promise<Watcher[]>;
  /** Watches of markets whose seed is `seed`. */
  marketWatchers(seed: string): Promise<Array<Watcher & { marketId: string }>>;
  /** Writes alerts; a (user, dedupe) pair that exists is left alone. */
  addAlerts(rows: NewAlert[]): Promise<void>;
}

/** Phrases that reached `threshold` in `cur` after being below it (or absent) in the scan before. */
export function crossings(prev: SeedSnapshot | undefined, cur: SeedSnapshot, threshold: number) {
  // The first scan of a seed is its baseline: nothing crossed yet.
  if (!prev) return [];
  const before = new Map(prev.phrases.map((p) => [p.phrase, p.opportunity]));
  return cur.phrases
    .filter((p) => p.opportunity >= threshold && (before.get(p.phrase) ?? -1) < threshold)
    .map((p) => ({ phrase: p.phrase, opportunity: p.opportunity, previous: before.get(p.phrase) ?? null }));
}

/** Alerts for every non-muted watcher of a seed after a new snapshot. */
export function seedAlerts(watchers: Watcher[], prev: SeedSnapshot | undefined, cur: SeedSnapshot): NewAlert[] {
  return watchers
    .filter((w) => !w.muted)
    .flatMap((w) => {
      const threshold = w.threshold ?? DEFAULT_SEED_THRESHOLD;
      return crossings(prev, cur, threshold).map(
        (c): NewAlert => ({
          userId: w.userId,
          watchId: w.watchId,
          kind: "opportunity",
          seed: cur.seed,
          region: cur.region,
          title: `“${c.phrase}” crossed the opportunity threshold (${threshold})`,
          detail: { phrase: c.phrase, opportunity: c.opportunity, previous: c.previous, threshold, scannedAt: cur.scannedAt, previousScanAt: prev!.scannedAt },
          dedupe: `opportunity|${w.watchId}|${c.phrase}|${cur.scannedAt}`,
        }),
      );
    });
}

/** Alerts for the watchers of a market whose re-run found at least `threshold` new buyer-intent signals. */
export function marketAlerts(watchers: Array<Watcher & { marketId: string }>, report: ChangeReport): NewAlert[] {
  if (!report.added || !report.baselineAt) return []; // a first reading has nothing to compare
  const added = report.added.buyerIntent;
  return watchers
    .filter((w) => !w.muted && added >= (w.threshold ?? DEFAULT_MARKET_THRESHOLD))
    .map(
      (w): NewAlert => ({
        userId: w.userId,
        watchId: w.watchId,
        kind: "market_change",
        seed: report.seed,
        region: "",
        title: `${added} new buyer-intent signal${added === 1 ? "" : "s"} for a watched market`,
        detail: { marketId: w.marketId, added: report.added, runId: report.runId, baselineAt: report.baselineAt, at: report.createdAt, threshold: w.threshold ?? DEFAULT_MARKET_THRESHOLD },
        dedupe: `market_change|${w.watchId}|${report.runId}`,
      }),
    );
}

// ---- the weekly digest ------------------------------------------------------------------------------

export interface DigestSeedLine {
  watchId: string;
  seed: string;
  region: string;
  count: number;
  phrases: Array<{ phrase: string; firstSeen: string }>;
}
export interface DigestMarketLine {
  watchId: string;
  seed: string;
  marketId: string;
  runs: number;
  added: { buyerIntent: number; complaints: number; competitors: number };
  /** Dated: the run of every report counted. */
  reports: Array<{ runId: string; at: string }>;
}
export interface Digest {
  since: string;
  /** New ideas across the tracked seeds: the sum of the seed lines' counts. */
  newIdeas: number;
  seeds: DigestSeedLine[];
  markets: DigestMarketLine[];
}

/**
 * "N new ideas this week" (DEC-010). N is the sum over tracked seeds of the phrases first seen in
 * a snapshot of the last 7 days, so it reconciles to `seed_snapshots` rows. A watched market adds
 * the change reports of the same days, summed from their stored `added` counts.
 */
export function buildDigest(
  seeds: Array<{ watchId: string; seed: string; region: string; snapshots: SeedSnapshot[] }>,
  markets: Array<{ watchId: string; seed: string; marketId: string; reports: ChangeReport[] }>,
  now: Date,
): Digest {
  const seedLines = seeds.map((s): DigestSeedLine => {
    const w = newThisWeek(s.snapshots, now);
    return { watchId: s.watchId, seed: s.seed, region: s.region, count: w.count, phrases: w.phrases };
  });
  const since = newThisWeek([], now).since;
  const marketLines = markets.map((m): DigestMarketLine => {
    const inWeek = m.reports.filter((r) => r.createdAt >= since && r.added);
    const sum = (k: "buyerIntent" | "complaints" | "competitors") => inWeek.reduce((n, r) => n + (r.added?.[k] ?? 0), 0);
    return {
      watchId: m.watchId,
      seed: m.seed,
      marketId: m.marketId,
      runs: inWeek.length,
      added: { buyerIntent: sum("buyerIntent"), complaints: sum("complaints"), competitors: sum("competitors") },
      reports: inWeek.map((r) => ({ runId: r.runId, at: r.createdAt })),
    };
  });
  return { since, newIdeas: seedLines.reduce((n, l) => n + l.count, 0), seeds: seedLines, markets: marketLines };
}

// ---- settings requests (untrusted) --------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseSettings(body: unknown): { watchId: string; threshold?: number | null; muted?: boolean } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.watchId !== "string" || !UUID.test(b.watchId)) return { error: "watchId must be a watch id" };
  const out: { watchId: string; threshold?: number | null; muted?: boolean } = { watchId: b.watchId };
  if ("threshold" in b) {
    const t = b.threshold;
    if (t !== null && !(typeof t === "number" && Number.isInteger(t) && t >= 1 && t <= 100)) return { error: "threshold must be a whole number from 1 to 100, or null for the default" };
    out.threshold = t;
  }
  if ("muted" in b) {
    if (typeof b.muted !== "boolean") return { error: "muted must be true or false" };
    out.muted = b.muted;
  }
  if (!("threshold" in out) && !("muted" in out)) return { error: "send threshold, muted, or both" };
  return out;
}
