// lib/trends/niche.ts — the seed's own Google Trends reading, kept apart from any market's trend.
// The classifier files a signal under a market only when it names a problem; "pc troubleshooting"
// search interest names none, so it reaches no market. It is still observed evidence about the
// niche, read from the run's own rows (`run_signals`) and always labelled as the niche's (QC Rule 2).

import type { SupabaseClient } from "@supabase/supabase-js";

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export interface NicheTrend {
  runId: string;
  seed: string;
  /** Interest-over-time readings of the seed (one per window). */
  count: number;
  /** Mean of the readings' average interest, 0..100. */
  avgInterest: number;
  direction: "rising" | "falling" | "flat";
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
  const direction = dirs.size === 1 && (dirs.has("rising") || dirs.has("falling")) ? ([...dirs][0] as "rising" | "falling") : "flat";
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

/** The niche trend of each run id given, read from its own `run_signals`. */
export async function fetchNicheTrends(supabase: SupabaseClient, runs: Array<{ id: string; query: string }>): Promise<NicheTrend[]> {
  const out: NicheTrend[] = [];
  for (const { id: runId, query } of runs) {
    const { data, error } = await supabase
      .from("run_signals")
      .select("signals ( url, engagement, sources ( type ) )")
      .eq("run_id", runId);
    if (error) throw new Error(`Failed to load the niche trend: ${error.message}`);
    const rows = ((data ?? []) as unknown as Array<{ signals: Rel<NicheRow> }>).flatMap((l) => one(l.signals) ?? []);
    const t = summarizeNicheTrend(runId, query, rows);
    if (t) out.push(t);
  }
  return out;
}

/** The niche trend of one run by id (market and opportunity pages); null for a legacy row with no run. */
export async function fetchNicheTrendOfRun(supabase: SupabaseClient, runId: string | null): Promise<NicheTrend | null> {
  if (!runId) return null;
  const { data: run } = await supabase.from("research_runs").select("query").eq("id", runId).maybeSingle();
  if (!run) return null;
  return (await fetchNicheTrends(supabase, [{ id: runId, query: String(run.query ?? "") }]))[0] ?? null;
}

/** One line for the report, stating whose trend it is and from how many readings. */
export function nicheTrendLine(t: NicheTrend): string {
  const win = t.windowDays ? `${t.windowDays}-day ` : "";
  return `Niche trend for "${t.seed}": ${win}search interest averages ${t.avgInterest}/100 and is ${t.direction}, from ${t.count} Google Trends reading${t.count === 1 ? "" : "s"} (${t.points} points). Seed-level context, not a market's trend.`;
}
