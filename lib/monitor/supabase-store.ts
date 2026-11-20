// lib/monitor/supabase-store.ts: the service-role MonitorStore (Part 4.2). Server-only.

import { createServiceSupabaseClient } from "../db/client.ts";
import { normalizeSeed } from "./diff.ts";
import type { ChangeReport, Job, MonitorStore, SeedSnapshot, WatchTargets } from "./types.ts";

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`monitor: ${what}: ${error.message}`);
};

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export function supabaseMonitorStore(): MonitorStore {
  const db = createServiceSupabaseClient();
  return {
    async watchTargets(): Promise<WatchTargets> {
      const { data, error } = await db.from("watchlists").select("kind, ref, region").in("kind", ["seed", "market"]);
      fail("watchlists", error);
      const seeds = new Map<string, { seed: string; region: string }>();
      const marketIds: string[] = [];
      for (const w of data ?? []) {
        if (w.kind === "seed") seeds.set(`${w.region}|${w.ref}`, { seed: normalizeSeed(w.ref as string), region: w.region as string });
        else marketIds.push(w.ref as string);
      }
      const marketSeeds = new Set<string>();
      if (marketIds.length > 0) {
        const { data: markets, error: mErr } = await db.from("markets").select("id, research_runs ( query )").in("id", marketIds);
        fail("markets", mErr);
        for (const m of markets ?? []) {
          const q = one((m as unknown as { research_runs: Rel<{ query: string }> }).research_runs)?.query;
          if (q) marketSeeds.add(normalizeSeed(q)); // a legacy market without a run has no seed to re-run
        }
      }
      return { seeds: [...seeds.values()], marketSeeds: [...marketSeeds] };
    },

    async getJob(key) {
      const { data, error } = await db.from("monitor_jobs").select("key, last_ok_at, failures, next_due_at, last_error").eq("key", key).maybeSingle();
      fail("job", error);
      return data ? { key: data.key, lastOkAt: data.last_ok_at, failures: data.failures, nextDueAt: data.next_due_at, lastError: data.last_error } : null;
    },
    async saveJob(job: Job) {
      const { error } = await db
        .from("monitor_jobs")
        .upsert({ key: job.key, last_ok_at: job.lastOkAt, failures: job.failures, next_due_at: job.nextDueAt, last_error: job.lastError }, { onConflict: "key" });
      fail("save job", error);
    },

    async snapshots(seed, region, limit = 60) {
      const { data, error } = await db
        .from("seed_snapshots")
        .select("seed, region, scanned_at, phrases")
        .eq("seed", normalizeSeed(seed))
        .eq("region", region)
        .order("scanned_at", { ascending: false })
        .limit(limit);
      fail("snapshots", error);
      return (data ?? []).reverse().map((r) => ({ seed: r.seed, region: r.region, scannedAt: r.scanned_at, phrases: r.phrases })) as SeedSnapshot[];
    },
    async saveSnapshot(s) {
      const { error } = await db.from("seed_snapshots").insert({ seed: s.seed, region: s.region, scanned_at: s.scannedAt, phrases: s.phrases });
      fail("save snapshot", error);
    },

    async saveReport(r) {
      const { error } = await db
        .from("change_reports")
        .upsert({ seed: normalizeSeed(r.seed), run_id: r.runId, baseline_run_id: r.baselineRunId, created_at: r.createdAt, report: r }, { onConflict: "run_id" });
      fail("save report", error);
    },
    async reports(seed, limit = 5) {
      const { data, error } = await db.from("change_reports").select("report").eq("seed", normalizeSeed(seed)).order("created_at", { ascending: false }).limit(limit);
      fail("reports", error);
      return (data ?? []).map((r) => r.report as ChangeReport);
    },
  };
}
