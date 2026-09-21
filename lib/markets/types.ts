// lib/markets/types.ts — Market data models and filter types for Market Explorer per PRD §7, §40.

export type MarketTrend =
  | "emerging"
  | "accelerating"
  | "seasonal"
  | "stable"
  | "declining"
  | "unknown";

export type BuyerIntentLevel = "weak" | "medium" | "strong" | "very_strong";

export interface TopOpportunity {
  id: string;
  title: string;
  opportunity_score: number;
  confidence: number;
  format?: string | null;
  target_audience?: string | null;
}

export interface MarketRowData {
  id: string;
  name: string;
  description: string | null;
  trend: MarketTrend;
  demand_score: number;
  competition_score: number;
  pdf_fit_score: number;
  confidence: number;
  created_at: string;
  evidence_count: number;
  signal_count: number;
  buyer_intent: BuyerIntentLevel;
  top_opportunity?: TopOpportunity | null;
  opportunity_count: number;
}

export type MarketTab = "trending" | "growth" | "intent" | "recent" | "all";

export interface MarketStats {
  totalMarkets: number;
  totalEvidence: number;
  totalOpportunities: number;
  totalSignals: number;
}

export interface FetchMarketsResult {
  markets: MarketRowData[];
  stats: MarketStats;
}
