// lib/monitor/monitor-steps.ts: the last step of a monitor run (Part 4.2), server-only. Collection
// and extraction reuse the Deep steps (lib/runs/deep-steps.ts); this one builds the change report.

import { createServiceSupabaseClient } from "../db/client.ts";
import { loadRunSignals } from "../runs/run-signals.ts";
import { afterRun, buildChangeReport, marketJobKey, normalizeSeed } from "./diff.ts";
import { marketAlerts } from "../alerts/alerts.ts";
import { supabaseAlertStore } from "../alerts/supabase-store.ts";
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
    .neq("id", runId)
    .ilike("query", normalizeSeed(seed).replace(/[\\%_]/g, "\\$&")) // no wildcard left: a case-insensitive equality
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`baseline lookup failed: ${error.message}`);
  const row = data?.[0];
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
  try {
    const alerts = supabaseAlertStore();
    await alerts.addAlerts(marketAlerts(await alerts.marketWatchers(input.seed), report));
  } catch (err) {
    console.error("alerts: could not write market alerts", err); // never fails the run (migration 20 may not be applied yet)
  }
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
