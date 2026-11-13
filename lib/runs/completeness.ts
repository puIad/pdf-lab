// lib/runs/completeness.ts — Research completeness calculation and DB reconciliation per PRD §55.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchCompleteness } from "./types.ts";
import { isDemandOnly } from "../sources/demand-only.ts";

export interface CompletenessRawCounts {
  sourcesCovered: number;
  signalsCollected: number;
  signalsAnalyzed: number;
  marketsIdentified: number;
  opportunitiesGenerated: number;
  evidenceCount: number;
  evidenceBackedOpportunitiesCount: number;
}

/**
 * Pure calculation of research completeness percentage from raw counts.
 * Weighted across:
 * - Sources (up to 3 sources = 20%)
 * - Signals (up to 20 signals = 20%)
 * - Analysis (signalsAnalyzed / signalsCollected = 20%)
 * - Markets (marketsIdentified > 0 = 15%)
 * - Opportunities evidence backing (evidenceBacked / generated = 25%)
 */
export function calculateCompleteness(counts: CompletenessRawCounts): ResearchCompleteness {
  let score = 0;

  // 1. Sources (max 3 sources = 20%)
  const sourceScore = Math.min(1, counts.sourcesCovered / 3) * 20;
  score += sourceScore;

  // 2. Signals volume (max 20 signals = 20%)
  const signalScore = counts.signalsCollected > 0
    ? Math.min(1, counts.signalsCollected / 20) * 20
    : 0;
  score += signalScore;

  // 3. Analysis ratio (20%)
  const analysisScore = counts.signalsCollected > 0
    ? (Math.min(counts.signalsAnalyzed, counts.signalsCollected) / counts.signalsCollected) * 20
    : 0;
  score += analysisScore;

  // 4. Markets identified (15%)
  const marketScore = counts.marketsIdentified > 0 ? 15 : 0;
  score += marketScore;

  // 5. Evidence-backed opportunities ratio (25%)
  let oppScore = 0;
  if (counts.opportunitiesGenerated > 0) {
    oppScore =
      (Math.min(counts.evidenceBackedOpportunitiesCount, counts.opportunitiesGenerated) /
        counts.opportunitiesGenerated) *
      25;
  }
  score += oppScore;

  return {
    ...counts,
    completenessPercentage: Math.round(score),
  };
}

/**
 * Counts what one run collected and produced, from its own rows (`run_signals`, `run_id`).
 * Runs from before Part 6.7 have no such rows and count as zero.
 */
export async function fetchRunCompleteness(
  supabase: SupabaseClient,
  runId: string,
): Promise<ResearchCompleteness> {
  const { data: links, error: sigErr } = await supabase
    .from("run_signals")
    .select("signals ( id, source_id, external_id, sources ( type ), signal_analysis ( id ) )")
    .eq("run_id", runId);
  if (sigErr) {
    throw new Error(`Failed to count signals for completeness: ${sigErr.message}`);
  }

  type Rel<T> = T | T[] | null | undefined;
  const one = <T>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const allRows = ((links ?? []) as unknown as Array<{
    signals: Rel<{
      id: string;
      source_id: string;
      external_id: string | null;
      sources: Rel<{ type?: string }>;
      signal_analysis: Rel<{ id: string }>;
    }>;
  }>).flatMap((l) => one(l.signals) ?? []);
  // Every source that answered counts as covered; only discussion rows count as signals to analyze
  // (demand-only rows are never extracted, so they would read as permanently unanalyzed).
  const distinctSources = new Set(allRows.map((s) => s.source_id)).size;
  const signalRows = allRows.filter((s) => !isDemandOnly({ source_type: one(s.sources)?.type, external_id: s.external_id }));
  const analyzedCount = signalRows.filter((s) => one(s.signal_analysis)).length;

  const [{ data: markets }, { data: opps }] = await Promise.all([
    supabase.from("markets").select("id").eq("run_id", runId),
    supabase.from("opportunities").select("id").eq("run_id", runId),
  ]);
  const marketIds = (markets ?? []).map((m) => m.id as string);
  const oppIds = (opps ?? []).map((o) => o.id as string);

  // Evidence of the run: its markets, its opportunities, and competitors attached to the run only.
  let evidenceCount = 0;
  let evidenceBackedOpportunitiesCount = 0;
  const { data: evRows } = await supabase
    .from("evidence")
    .select("id, entity_type, entity_id")
    .in("entity_id", [runId, ...marketIds, ...oppIds]);
  if (evRows) {
    evidenceCount = evRows.length;
    evidenceBackedOpportunitiesCount = new Set(
      evRows.filter((e) => e.entity_type === "opportunity").map((e) => e.entity_id),
    ).size;
  }

  return calculateCompleteness({
    sourcesCovered: distinctSources,
    signalsCollected: signalRows.length,
    signalsAnalyzed: analyzedCount,
    marketsIdentified: marketIds.length,
    opportunitiesGenerated: oppIds.length,
    evidenceCount,
    evidenceBackedOpportunitiesCount,
  });
}
