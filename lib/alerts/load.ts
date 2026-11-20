// lib/alerts/load.ts: what the alerts page and GET /api/alerts show one person (Part 4.3). Server-only.
// Alerts and settings are read as the caller (owner-only RLS); the digest reads the private
// monitoring tables for the caller's own watches only.

import { createServerSupabaseClient } from "../db/client.ts";
import { supabaseMonitorStore } from "../monitor/supabase-store.ts";
import { loadMonitorView } from "../monitor/view.ts";
import type { WatchItem } from "../watchlist/watchlist.ts";
import { buildDigest, type Digest } from "./alerts.ts";

export interface AlertRow {
  id: string;
  watch_id: string;
  kind: "opportunity" | "market_change";
  seed: string;
  region: string;
  title: string;
  detail: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}
export interface SettingRow {
  watch_id: string;
  threshold: number | null;
  muted: boolean;
}

export async function loadAlerts(userId: string): Promise<{ alerts: AlertRow[]; settings: Record<string, SettingRow> }> {
  const db = await createServerSupabaseClient();
  const [a, s] = await Promise.all([
    db.from("alerts").select("id, watch_id, kind, seed, region, title, detail, created_at, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    db.from("alert_settings").select("watch_id, threshold, muted").eq("user_id", userId),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (s.error) throw new Error(s.error.message);
  return { alerts: (a.data ?? []) as AlertRow[], settings: Object.fromEntries(((s.data ?? []) as SettingRow[]).map((r) => [r.watch_id, r])) };
}

export async function loadDigest(watches: WatchItem[], now: Date = new Date()): Promise<Digest> {
  const store = supabaseMonitorStore();
  const seeds = await Promise.all(
    watches.filter((w) => w.kind === "seed").map(async (w) => ({ watchId: w.id, seed: w.ref, region: w.region, snapshots: await store.snapshots(w.ref, w.region) })),
  );
  const view = await loadMonitorView(store, watches.filter((w) => w.kind === "market"), now);
  const markets = await Promise.all(
    Object.values(view.markets)
      .flatMap((m) => (m.seed && m.market ? [{ watchId: m.watchId, seed: m.seed, marketId: m.market.id }] : []))
      .map(async (m) => ({ ...m, reports: await store.reports(m.seed, 10) })),
  );
  return buildDigest(seeds, markets, now);
}
