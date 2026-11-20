// lib/trends/niche.ts — the seed's own Google Trends reading, kept apart from any market's trend.
// The classifier files a signal under a market only when it names a problem; "pc troubleshooting"
// search interest names none, so it reaches no market. It is still observed evidence about the
// niche, read from the run's own rows (`run_signals`) and always labelled as the niche's (QC Rule 2).

import type { SupabaseClient } from "@supabase/supabase-js";
import { ownsRun, type RunViewer } from "../runs/scope.ts";

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export interface NicheTrend {
  runId: string;
  seed: string;
  /** Interest-over-time readings of the seed (one per window). */
  count: number;
  /** Mean of the readings' average interest, 0..100. */
  avgInterest: number;
  direction: "rising" | "falling" | "flat" | "mixed";
  windowDays: number | null;
  /** Google Trends points behind the readings. */
  points: number;
  url: string | null;
}

interface NicheRow {
  url: string | null;
  engagement: Record<string, unknown> | null;
  sources: Rel<{ type: string | null }>;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Interest-over-time rows of the gtrends adapter only; related queries are not a trend reading. */
export function summarizeNicheTrend(runId: string, seed: string, rows: NicheRow[]): NicheTrend | null {
  const iot = rows.filter((r) => {
    const e = r.engagement;
    return one(r.sources)?.type === "gtrends" && e && num(e.avg_interest) !== null && !("related_query" in e);
  });
  if (iot.length === 0) return null;
  const avg = iot.reduce((s, r) => s + (num(r.engagement!.avg_interest) as number), 0) / iot.length;
  const dirs = new Set(iot.map((r) => r.engagement!.direction));
  const direction: NicheTrend["direction"] =
    dirs.size > 1 ? "mixed" : dirs.has("rising") ? "rising" : dirs.has("falling") ? "falling" : "flat";
  return {
    runId,
    seed,
    count: iot.length,
    avgInterest: Math.round(avg),
    direction,
    windowDays: num(iot[0].engagement!.window_days),
    points: iot.reduce((s, r) => s + (num(r.engagement!.points) ?? 0), 0),
    url: iot[0].url,
  };
}

/** The niche trend of each run given, read from its own `run_signals` in one query. Never throws. */
export async function fetchNicheTrends(supabase: SupabaseClient, runs: Array<{ id: string; query: string }>): Promise<NicheTrend[]> {
  if (runs.length === 0) return [];
  const { data, error } = await supabase
    .from("run_signals")
    .select("run_id, signals ( url, engagement, sources ( type ) )")
    .in("run_id", runs.map((r) => r.id));
  if (error) {
    console.error(`Could not load the niche trend: ${error.message}`);
    return [];
  }
  const byRun = new Map<string, NicheRow[]>();
  for (const l of (data ?? []) as unknown as Array<{ run_id: string; signals: Rel<NicheRow> }>) {
    const row = one(l.signals);
    if (row) byRun.set(l.run_id, [...(byRun.get(l.run_id) ?? []), row]);
  }
  return runs.flatMap(({ id, query }) => summarizeNicheTrend(id, query, byRun.get(id) ?? []) ?? []);
}

/** The niche trend of one run by id (market and opportunity pages); null for a legacy row, or when the viewer does not own the run. */
export async function fetchNicheTrendOfRun(supabase: SupabaseClient, runId: string | null, viewer: RunViewer | null): Promise<NicheTrend | null> {
  if (!runId) return null;
  const { data: run } = await supabase.from("research_runs").select("query, user_id").eq("id", runId).maybeSingle();
  if (!run || !ownsRun(viewer, (run.user_id as string | null) ?? null)) return null;
  return (await fetchNicheTrends(supabase, [{ id: runId, query: String(run.query ?? "") }]))[0] ?? null;
}

/** One line for the report, stating whose trend it is and from how many readings. */
export function nicheTrendLine(t: NicheTrend): string {
  const win = t.windowDays ? `${t.windowDays}-day ` : "";
  return `Niche trend for "${t.seed}": ${win}search interest averages ${t.avgInterest}/100 and is ${t.direction}, from ${t.count} Google Trends reading${t.count === 1 ? "" : "s"} (${t.points} points). Seed-level context, not a market's trend.`;
}
