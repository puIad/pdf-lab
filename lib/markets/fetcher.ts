// lib/markets/fetcher.ts — DB-backed markets fetcher with evidence-derived scores per PRD §7, §40.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MarketRowData,
  MarketStats,
  FetchMarketsResult,
  MarketTrend,
  TopOpportunity,
  BuyerIntentLevel,
} from "./types.ts";
import { fetchNicheTrends } from "../trends/niche.ts";
import { readAll, readAllIn } from "../db/read-all.ts";
import { distinctEvidenceRows } from "../evidence/types.ts";
import { isCurrent, listCompletedRuns, listedRuns, type RunViewer } from "../runs/scope.ts";

/**
 * Which markets to read (Part 6.7): "all" = the latest completed run of each seed plus legacy rows,
 * "latest" = the latest completed run of each seed, "legacy" = rows from before run scoping,
 * anything else = one run id.
 */
export type MarketScope = string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseMarketScope(value: string | null | undefined, fallback: MarketScope): MarketScope {
  return value && (["all", "latest", "legacy"].includes(value) || UUID.test(value)) ? value : fallback;
}

const VALID_TRENDS: Set<MarketTrend> = new Set([
  "emerging",
  "accelerating",
  "seasonal",
  "stable",
  "declining",
  "unknown",
]);

const INTENT_VALUES: Record<string, number> = {
  very_strong: 4,
  strong: 3,
  medium: 2,
  weak: 1,
};

function resolveIntentFromScore(avg: number): BuyerIntentLevel {
  if (avg >= 3.25) return "very_strong";
  if (avg >= 2.25) return "strong";
  if (avg >= 1.5) return "medium";
  return "weak";
}

export async function fetchMarketsData(
  supabase: SupabaseClient,
  scope: MarketScope = "all",
  /** Decides which runs are listed by seed in `runs`; none without a viewer. */
  viewer: RunViewer | null = null,
): Promise<FetchMarketsResult> {
  // 1. Fetch markets, then keep the ones in scope
  // Every read below goes in ordered pages: PostgREST caps one response at 1000 rows.
  const allMarkets = await readAll<Record<string, unknown>>("markets", () =>
    supabase
      .from("markets")
      .select("id, run_id, name, description, trend, demand_score, competition_score, pdf_fit_score, confidence, created_at")
      .order("created_at", { ascending: false })
      .order("id"),
  );
  const allRuns = await listCompletedRuns(supabase);
  const latest = new Set(allRuns.filter((r) => r.latest).map((r) => r.id));
  const runs = listedRuns(allRuns, viewer);
  const legacyCount = allMarkets.filter((m) => !m.run_id).length;

  const rawMarkets = allMarkets.filter((m) => {
    const runId = (m.run_id as string | null) ?? null;
    if (scope === "all") return isCurrent(runId, latest);
    if (scope === "latest") return !!runId && latest.has(runId);
    if (scope === "legacy") return !runId;
    return runId === scope;
  });
  if (rawMarkets.length === 0) {
    return {
      markets: [],
      stats: {
        totalMarkets: 0,
        totalEvidence: 0,
        totalOpportunities: 0,
        totalSignals: 0,
      },
      runs,
      scope,
      legacyCount,
    };
  }

  const marketIds = rawMarkets.map((m) => m.id as string);
  const nicheTrends = await fetchNicheTrends(
    supabase,
    runs.filter((r) => rawMarkets.some((m) => m.run_id === r.id)),
  );

  // 2. Fetch opportunities
  const rawOpps = await readAllIn<Record<string, unknown>>("opportunities", marketIds, (chunk) =>
    supabase
      .from("opportunities")
      .select("id, market_id, title, opportunity_score, confidence, format, format_basis, target_audience")
      .in("market_id", chunk)
      .order("opportunity_score", { ascending: false })
      .order("id"),
  );
  const oppsByMarket: Record<string, TopOpportunity[]> = {};
  const oppIdsByMarket: Record<string, Set<string>> = {};

  for (const opp of rawOpps) {
    const mId = opp.market_id as string;
    if (!oppsByMarket[mId]) {
      oppsByMarket[mId] = [];
      oppIdsByMarket[mId] = new Set();
    }
    oppsByMarket[mId].push({
      id: opp.id as string,
      title: opp.title as string,
      opportunity_score: typeof opp.opportunity_score === "number" ? opp.opportunity_score : 0,
      confidence: typeof opp.confidence === "number" ? opp.confidence : 0,
      format: (opp.format as string) || null,
      format_basis: (opp.format_basis as string) || null,
      target_audience: (opp.target_audience as string) || null,
    });
    oppIdsByMarket[mId].add(opp.id as string);
  }

  // 3. Fetch evidence rows
  const rawEvidence = distinctEvidenceRows(
    await readAllIn<{ entity_id: string; claim: string; url: string | null }>(
      "evidence",
      [...marketIds, ...rawOpps.map((o) => o.id as string)],
      (chunk) => supabase.from("evidence").select("id, entity_id, claim, url").in("entity_id", chunk).order("id"),
    ),
  );
  const evidenceCountByMarket: Record<string, number> = {};

  for (const ev of rawEvidence) {
    const eId = ev.entity_id;
    // Check if it's directly attached to market
    if (marketIds.includes(eId)) {
      evidenceCountByMarket[eId] = (evidenceCountByMarket[eId] || 0) + 1;
    } else {
      // Check if it's attached to an opportunity of this market
      for (const mId of marketIds) {
        if (oppIdsByMarket[mId]?.has(eId)) {
          evidenceCountByMarket[mId] = (evidenceCountByMarket[mId] || 0) + 1;
          break;
        }
      }
    }
  }

  // 4. Fetch linked signals with analysis
  const rawMarketSignals = await readAllIn<{ market_id: string }>("market signals", marketIds, (chunk) =>
    supabase
    .from("market_signals")
    .select(`
      market_id,
      signal_id,
      signals (
        id,
        signal_analysis (
          intent,
          urgency
        )
      )
    `)
    .in("market_id", chunk)
    .order("market_id")
    .order("signal_id"),
  );
  const signalsCountByMarket: Record<string, number> = {};
  const intentScoresByMarket: Record<string, number[]> = {};

  for (const ms of rawMarketSignals) {
    const mId = ms.market_id as string;
    signalsCountByMarket[mId] = (signalsCountByMarket[mId] || 0) + 1;

    const signalObj = (ms as unknown as {
      signals?: {
        signal_analysis?: {
          intent?: string;
          urgency?: string;
        };
      };
    })?.signals;

    const rawIntent = signalObj?.signal_analysis?.intent?.toLowerCase().trim();
    if (rawIntent && INTENT_VALUES[rawIntent]) {
      if (!intentScoresByMarket[mId]) {
        intentScoresByMarket[mId] = [];
      }
      intentScoresByMarket[mId].push(INTENT_VALUES[rawIntent]);
    }
  }

  // 5. Assemble MarketRowData
  const markets: MarketRowData[] = rawMarkets.map((m) => {
    const id = m.id as string;
    const marketOpps = oppsByMarket[id] || [];
    const topOpp = marketOpps.length > 0 ? marketOpps[0] : null;

    const trendRaw = ((m.trend as string | null) || "unknown").toLowerCase().trim() as MarketTrend;
    const trend: MarketTrend = VALID_TRENDS.has(trendRaw) ? trendRaw : "unknown";

    const intentList = intentScoresByMarket[id] || [];
    let buyerIntent: BuyerIntentLevel = "medium";
    if (intentList.length > 0) {
      const avg = intentList.reduce((a, b) => a + b, 0) / intentList.length;
      buyerIntent = resolveIntentFromScore(avg);
    } else if (topOpp && topOpp.opportunity_score >= 60) {
      buyerIntent = "strong";
    }

    const evCount = evidenceCountByMarket[id] || 0;
    const sigCount = signalsCountByMarket[id] || 0;

    return {
      id,
      name: (m.name as string) || "Untitled Market",
      description: (m.description as string) || null,
      trend,
      demand_score: Math.round((typeof m.demand_score === "number" ? m.demand_score : 0) * 10) / 10,
      competition_score: Math.round((typeof m.competition_score === "number" ? m.competition_score : 0) * 10) / 10,
      pdf_fit_score: Math.round((typeof m.pdf_fit_score === "number" ? m.pdf_fit_score : 0) * 10) / 10,
      confidence: Math.round((typeof m.confidence === "number" ? m.confidence : 0) * 100) / 100,
      created_at: (m.created_at as string) || new Date().toISOString(),
      evidence_count: evCount,
      signal_count: sigCount,
      buyer_intent: buyerIntent,
      top_opportunity: topOpp,
      opportunity_count: marketOpps.length,
    };
  });

  const stats: MarketStats = {
    totalMarkets: markets.length,
    totalEvidence: Object.values(evidenceCountByMarket).reduce((a, b) => a + b, 0),
    totalOpportunities: rawOpps.length,
    totalSignals: rawMarketSignals.length,
  };

  return {
    markets,
    stats,
    runs,
    scope,
    legacyCount,
    nicheTrends,
  };
}
