// lib/alerts/supabase-store.ts: the service-role AlertStore (Part 4.3). Server-only.

import { createServiceSupabaseClient } from "../db/client.ts";
import { normalizeSeed } from "../monitor/diff.ts";
import type { AlertStore, NewAlert, Watcher } from "./alerts.ts";

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`alerts: ${what}: ${error.message}`);
};

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export function supabaseAlertStore(): AlertStore {
  const db = createServiceSupabaseClient();

  async function withSettings(rows: Array<{ id: string; user_id: string }>): Promise<Watcher[]> {
    if (rows.length === 0) return [];
    const { data, error } = await db.from("alert_settings").select("watch_id, threshold, muted").in("watch_id", rows.map((r) => r.id));
    fail("settings", error);
    const by = new Map((data ?? []).map((s) => [s.watch_id as string, s]));
    return rows.map((r) => ({ watchId: r.id, userId: r.user_id, threshold: (by.get(r.id)?.threshold as number | null) ?? null, muted: (by.get(r.id)?.muted as boolean) ?? false }));
  }

  return {
    async seedWatchers(seed, region) {
      const { data, error } = await db.from("watchlists").select("id, user_id").eq("kind", "seed").eq("ref", normalizeSeed(seed)).eq("region", region);
      fail("seed watches", error);
      return withSettings((data ?? []) as Array<{ id: string; user_id: string }>);
    },
    async marketWatchers(seed) {
      const { data, error } = await db.from("watchlists").select("id, user_id, ref").eq("kind", "market");
      fail("market watches", error);
      const watches = (data ?? []) as Array<{ id: string; user_id: string; ref: string }>;
      if (watches.length === 0) return [];
      const { data: markets, error: mErr } = await db.from("markets").select("id, research_runs ( query )").in("id", watches.map((w) => w.ref));
      fail("markets", mErr);
      const ofSeed = new Set(
        (markets ?? []).filter((m) => normalizeSeed(one((m as unknown as { research_runs: Rel<{ query: string }> }).research_runs)?.query ?? "") === normalizeSeed(seed)).map((m) => m.id as string),
      );
      const mine = watches.filter((w) => ofSeed.has(w.ref));
      const settings = await withSettings(mine);
      return settings.map((s, i) => ({ ...s, marketId: mine[i].ref }));
    },
    async addAlerts(rows: NewAlert[]) {
      if (rows.length === 0) return;
      const { error } = await db.from("alerts").upsert(
        rows.map((r) => ({ user_id: r.userId, watch_id: r.watchId, kind: r.kind, seed: r.seed, region: r.region, title: r.title, detail: r.detail, dedupe: r.dedupe })),
        { onConflict: "user_id,dedupe", ignoreDuplicates: true },
      );
      fail("add", error);
    },
  };
}
