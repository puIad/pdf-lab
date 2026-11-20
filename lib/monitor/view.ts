// lib/monitor/view.ts: what a person sees about the rows they watch (Part 4.2). Server-only.
// Reads the service-role monitoring tables, but only for the seeds and markets of the caller's own
// watchlist rows, so the tables stay private.

import { createServiceSupabaseClient } from "../db/client.ts";
import { listCompletedRuns, seedKey } from "../runs/scope.ts";
import type { WatchItem } from "../watchlist/watchlist.ts";
import { diffSnapshots, newThisWeek, normalizeSeed } from "./diff.ts";
import { followMarket, type MarketRef } from "./follow.ts";
import type { ChangeReport, MonitorStore, PhraseChange } from "./types.ts";

export interface SeedView {
  seed: string;
  region: string;
  lastScanAt: string | null;
  snapshots: number;
  newThisWeek: { count: number; since: string; phrases: Array<{ phrase: string; firstSeen: string }> };
  /** The last scan against the one before it. */
  changes: PhraseChange[];
}

export interface MarketView {
  watchId: string;
  /** The market to show now: the watched one, or the same-named market of the seed's newest run. */
  market: MarketRef | null;
  seed: string | null;
  report: ChangeReport | null;
}

export async function loadMonitorView(store: MonitorStore, watches: WatchItem[], now: Date = new Date()): Promise<{ seeds: Record<string, SeedView>; markets: Record<string, MarketView> }> {
  const seeds: Record<string, SeedView> = {};
  for (const w of watches.filter((x) => x.kind === "seed")) {
    const snaps = await store.snapshots(w.ref, w.region);
    const last = snaps[snaps.length - 1];
    seeds[w.id] = {
      seed: normalizeSeed(w.ref),
      region: w.region,
      lastScanAt: last?.scannedAt ?? null,
      snapshots: snaps.length,
      newThisWeek: newThisWeek(snaps, now),
      changes: last ? diffSnapshots(snaps.slice(0, -1), last) : [],
    };
  }

  const markets: Record<string, MarketView> = {};
  const marketWatches = watches.filter((x) => x.kind === "market");
  if (marketWatches.length === 0) return { seeds, markets };

  const db = createServiceSupabaseClient();
  const { data, error } = await db.from("markets").select("id, name, run_id, research_runs ( query )").in("id", marketWatches.map((w) => w.ref));
  if (error) throw new Error(error.message);
  const runs = await listCompletedRuns(db);
  type Row = { id: string; name: string; run_id: string | null; research_runs: { query: string } | { query: string }[] | null };
  const byId = new Map(((data ?? []) as Row[]).map((r) => [r.id, r]));

  for (const w of marketWatches) {
    const row = byId.get(w.ref);
    if (!row) {
      markets[w.id] = { watchId: w.id, market: null, seed: null, report: null };
      continue;
    }
    const rel = Array.isArray(row.research_runs) ? row.research_runs[0] : row.research_runs;
    const seed = rel?.query ? normalizeSeed(rel.query) : null;
    const watched: MarketRef = { id: row.id, name: row.name, runId: row.run_id };
    let market: MarketRef | null = watched;
    if (seed) {
      const latest = runs.find((r) => r.latest && seedKey(r.query) === seed);
      let latestMarkets: MarketRef[] = [];
      if (latest && latest.id !== row.run_id) {
        const { data: ms, error: mErr } = await db.from("markets").select("id, name, run_id").eq("run_id", latest.id);
        if (mErr) throw new Error(mErr.message);
        latestMarkets = (ms ?? []).map((m) => ({ id: m.id as string, name: m.name as string, runId: m.run_id as string }));
      }
      market = followMarket(watched, latest?.id ?? null, latestMarkets);
    }
    markets[w.id] = { watchId: w.id, market, seed, report: seed ? ((await store.reports(seed, 1))[0] ?? null) : null };
  }
  return { seeds, markets };
}
