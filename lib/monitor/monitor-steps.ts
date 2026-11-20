// lib/monitor/monitor-steps.ts: the last step of a monitor run (Part 4.2), server-only. Collection
// and extraction reuse the Deep steps (lib/runs/deep-steps.ts); this one builds the change report.

import { createServiceSupabaseClient } from "../db/client.ts";
import { loadRunSignals } from "../runs/run-signals.ts";
import { afterRun, buildChangeReport, marketJobKey } from "./diff.ts";
import { supabaseMonitorStore } from "./supabase-store.ts";
import type { ChangeReport } from "./types.ts";

/**
 * Baseline of a run: the newest earlier completed run of the same seed, a Deep run or an earlier
 * monitor run. Both store their signals in `run_signals`, so the counts come from the same rule.
 */
export async function findBaseline(runId: string, seed: string, startedAt: string): Promise<{ runId: string; at: string | null } | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from("research_runs")
    .select("id, query, started_at, completed_at")
    .eq("status", "completed")
    .in("mode", ["deep", "monitor"])
    .lt("started_at", startedAt)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`baseline lookup failed: ${error.message}`);
  const key = seed.trim().toLowerCase();
  const row = (data ?? []).find((r) => r.id !== runId && String(r.query).trim().toLowerCase() === key);
  return row ? { runId: row.id as string, at: (row.completed_at ?? row.started_at) as string } : null;
}

/** Builds and stores the change report of a finished collection, marks the run completed. */
export async function finishMonitorStep(input: { runId: string; seed: string; startedAt: string; extractionError: string | null }): Promise<ChangeReport> {
  const db = createServiceSupabaseClient();
  const store = supabaseMonitorStore();
  const current = await loadRunSignals(db, input.runId);
  const base = await findBaseline(input.runId, input.seed, input.startedAt);
  const report = buildChangeReport({
    seed: input.seed,
    runId: input.runId,
    createdAt: new Date().toISOString(),
    current,
    baseline: base ? { ...base, signals: await loadRunSignals(db, base.runId) } : null,
  });
  if (input.extractionError) report.note = [report.note, `Extraction did not finish: ${input.extractionError}`].filter(Boolean).join(" ");
  await store.saveReport(report);
  const { error } = await db.from("research_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", input.runId);
  if (error) throw new Error(`could not complete the run: ${error.message}`);
  return report;
}

/** A crashed monitor run: mark it failed and back its job off. */
export async function failMonitorStep(runId: string, seed: string, message: string): Promise<void> {
  const db = createServiceSupabaseClient();
  await db.from("research_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", runId);
  const store = supabaseMonitorStore();
  const key = marketJobKey(seed);
  await store.saveJob(afterRun(await store.getJob(key), key, new Date(), message));
}
