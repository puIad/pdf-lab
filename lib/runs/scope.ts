// lib/runs/scope.ts — which Deep runs readers show (Part 6.7).
// Markets, opportunities and competitors carry `run_id`. A reader shows the latest completed run
// of each seed; rows with `run_id` null are legacy data from before run scoping.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CompletedRun {
  id: string;
  query: string;
  completedAt: string | null;
  /** Newest completed run for its seed. */
  latest: boolean;
}

export const seedKey = (query: string): string => query.trim().toLowerCase();

/** Completed Deep runs, newest first. */
export async function listCompletedRuns(supabase: SupabaseClient): Promise<CompletedRun[]> {
  const { data, error } = await supabase
    .from("research_runs")
    .select("id, query, completed_at, started_at")
    .eq("mode", "deep")
    .eq("status", "completed")
    .order("started_at", { ascending: false });
  if (error) throw new Error(`Failed to list runs: ${error.message}`);
  const seen = new Set<string>();
  return (data ?? []).map((r) => {
    const key = seedKey(r.query as string);
    const latest = !seen.has(key);
    seen.add(key);
    return { id: r.id as string, query: r.query as string, completedAt: (r.completed_at as string) ?? null, latest };
  });
}

export async function latestRunIds(supabase: SupabaseClient): Promise<Set<string>> {
  return new Set((await listCompletedRuns(supabase)).filter((r) => r.latest).map((r) => r.id));
}

/** Legacy rows and rows of a seed's latest completed run are current; older runs are superseded. */
export function isCurrent(runId: string | null | undefined, latest: Set<string>): boolean {
  return !runId || latest.has(runId);
}
