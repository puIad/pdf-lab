// lib/runs/completeness.ts — Research completeness calculation and DB reconciliation per PRD §55.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchCompleteness } from "./types.ts";
import { buildSearchFilter } from "../db/search.ts";
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
 * Reconciles completeness numbers directly with live DB `select count(*)` queries.
 */
export async function fetchRunCompleteness(
  supabase: SupabaseClient,
  query: string,
): Promise<ResearchCompleteness> {
  const filter = buildSearchFilter(query);
  let queryBuilder = supabase.from("signals").select("id, source_id, external_id, sources ( type )");
  if (filter) {
    queryBuilder = queryBuilder.or(filter);
  }
  const { data: signals, error: sigErr } = await queryBuilder;

  if (sigErr) {
    throw new Error(`Failed to count signals for completeness: ${sigErr.message}`);
  }

  const allRows = (signals ?? []) as unknown as Array<{
    id: string;
    source_id: string;
    external_id: string | null;
    sources: { type?: string } | null;
  }>;
  // Every source that answered counts as covered; only discussion rows count as signals to analyze
  // (demand-only rows are never extracted, so they would read as permanently unanalyzed).
  const distinctSources = new Set(allRows.map((s) => s.source_id)).size;
  const signalRows = allRows.filter((s) => !isDemandOnly({ source_type: s.sources?.type, external_id: s.external_id }));
  const signalIds = signalRows.map((s) => s.id);

  let analyzedCount = 0;
  let marketIds: string[] = [];

  if (signalIds.length > 0) {
    // 2. Analyzed signals
    const { count, error: saErr } = await supabase
      .from("signal_analysis")
      .select("signal_id", { count: "exact", head: true })
      .in("signal_id", signalIds);

    if (!saErr && count != null) {
      analyzedCount = count;
    }

    // 3. Linked markets via market_signals
    const { data: msData } = await supabase
      .from("market_signals")
      .select("market_id")
      .in("signal_id", signalIds);

    if (msData) {
      marketIds = [...new Set(msData.map((m) => m.market_id))];
    }
  }

  // 4. Opportunities for those markets
  let opportunitiesCount = 0;
  let oppIds: string[] = [];

  if (marketIds.length > 0) {
    const { data: opps } = await supabase
      .from("opportunities")
      .select("id")
      .in("market_id", marketIds);

    if (opps) {
      opportunitiesCount = opps.length;
      oppIds = opps.map((o) => o.id);
    }
  }

  // 5. Evidence rows
  let evidenceCount = 0;
  let evidenceBackedOpportunitiesCount = 0;

  const entityIdsToCheck = [...marketIds, ...oppIds];
  if (entityIdsToCheck.length > 0) {
    const { data: evRows } = await supabase
      .from("evidence")
      .select("id, entity_type, entity_id")
      .in("entity_id", entityIdsToCheck);

    if (evRows) {
      evidenceCount = evRows.length;
      const backedOppIds = new Set(
        evRows.filter((e) => e.entity_type === "opportunity").map((e) => e.entity_id),
      );
      evidenceBackedOpportunitiesCount = backedOppIds.size;
    }
  }

  return calculateCompleteness({
    sourcesCovered: distinctSources,
    signalsCollected: signalRows.length,
    signalsAnalyzed: analyzedCount,
    marketsIdentified: marketIds.length,
    opportunitiesGenerated: opportunitiesCount,
    evidenceCount,
    evidenceBackedOpportunitiesCount,
  });
}
