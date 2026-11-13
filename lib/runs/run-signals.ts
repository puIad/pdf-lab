// lib/runs/run-signals.ts — the signals a run collected (Part 6.7, table `run_signals`).
// A run reads its own rows through this join, never a text match over the whole `signals` table.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredSignalForRun } from "./orchestrator.ts";

const ID_CHUNK = 25; // external ids travel in the URL of a GET

function parseVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string") {
    try {
      const trimmed = v.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) return JSON.parse(trimmed).map(Number);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Links every signal the run's ingest returned (new rows and rows already stored) to the run.
 * `collected`: adapter key → the external ids it returned.
 */
export async function recordRunSignals(
  supabase: SupabaseClient,
  runId: string,
  collected: Map<string, string[]>,
): Promise<number> {
  const keys = [...collected.keys()].filter((k) => collected.get(k)!.length > 0);
  if (keys.length === 0) return 0;
  const { data: sources, error } = await supabase.from("sources").select("id, type").in("type", keys);
  if (error) throw new Error(`run_signals: sources lookup failed: ${error.message}`);

  const signalIds = new Set<string>();
  for (const src of sources ?? []) {
    const externalIds = [...new Set(collected.get(src.type as string) ?? [])];
    for (let i = 0; i < externalIds.length; i += ID_CHUNK) {
      const { data, error: sigErr } = await supabase
        .from("signals")
        .select("id")
        .eq("source_id", src.id)
        .in("external_id", externalIds.slice(i, i + ID_CHUNK));
      if (sigErr) throw new Error(`run_signals: signal lookup failed: ${sigErr.message}`);
      for (const row of data ?? []) signalIds.add(row.id as string);
    }
  }
  if (signalIds.size === 0) return 0;
  const { error: insErr } = await supabase
    .from("run_signals")
    .upsert([...signalIds].map((signal_id) => ({ run_id: runId, signal_id })), {
      onConflict: "run_id,signal_id",
      ignoreDuplicates: true,
    });
  if (insErr) throw new Error(`run_signals: insert failed: ${insErr.message}`);
  return signalIds.size;
}

type Rel<T> = T | T[] | null | undefined;
const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface AnalysisRow {
  id: string;
  audience: string;
  problem: string;
  intent: string;
  urgency: string;
  pdf_relevance: number;
  embedding: unknown;
}
interface SignalRow {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  source_id: string;
  external_id: string | null;
  published_at: string | null;
  sources: Rel<{ type: string }>;
  signal_analysis: Rel<AnalysisRow>;
}

export async function loadRunSignals(supabase: SupabaseClient, runId: string): Promise<StoredSignalForRun[]> {
  const PAGE = 1000; // PostgREST max_rows
  const rows: SignalRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("run_signals")
      .select(
        "signal_id, signals ( id, title, content, url, source_id, external_id, published_at, sources ( type ), signal_analysis ( id, audience, problem, intent, urgency, pdf_relevance, embedding ) )",
      )
      .eq("run_id", runId)
      .order("signal_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch signals for run: ${error.message}`);
    for (const link of (data ?? []) as unknown as Array<{ signals: Rel<SignalRow> }>) {
      const s = one(link.signals);
      if (s) rows.push(s);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  return rows.map((r) => {
    const sa = one(r.signal_analysis);
    return {
      id: r.id,
      title: r.title,
      content: r.content,
      url: r.url,
      source_id: r.source_id,
      source_type: one(r.sources)?.type || "web",
      external_id: r.external_id,
      published_at: r.published_at,
      analysis: sa
        ? {
            id: sa.id,
            audience: sa.audience,
            problem: sa.problem,
            intent: sa.intent,
            urgency: sa.urgency,
            pdf_relevance: sa.pdf_relevance,
            embedding: parseVector(sa.embedding),
          }
        : null,
    };
  });
}
