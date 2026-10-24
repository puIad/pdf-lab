// lib/search/types.ts — Types for Market Search & Overview per PRD §8.

export interface EvidenceCitation {
  id?: string;
  source?: string;
  url?: string | null;
  claim?: string;
  excerpt?: string | null;
  signal_type?: string | null;
  created_at?: string | null;
}

export interface OverviewMetric<T = unknown> {
  observed: boolean;
  value: T | null;
  rawLabel: string;
  evidence: EvidenceCitation[];
  note?: string;
}

export interface PainPoint {
  problem: string;
  frequency: number;
  audience?: string | null;
  urgency?: "low" | "medium" | "high" | null;
  citations: EvidenceCitation[];
}

export interface UnderservedSubmarket {
  id?: string;
  name: string;
  reason: string;
  demandScore?: number | null;
  competitionScore?: number | null;
  opportunityCount?: number;
  citations: EvidenceCitation[];
}

export interface SizeProxyData {
  totalSignals: number;
  totalDiscussions: number;
  uniqueSources: number;
  estimatedReach: string;
}

export interface SearchInterestData {
  trendScore: number;
  direction: "rising" | "flat" | "declining";
  risingQueries: string[];
}

export interface TrendDirectionData {
  direction: "emerging" | "accelerating" | "seasonal" | "stable" | "declining" | "unknown";
  deltas?: string | null;
  timeWindowsEvaluated: number;
  historicalSignalsCount: number;
}

export interface DiscussionCountsData {
  total: number;
  bySource: Record<string, number>;
}

export interface BuyerIntentData {
  totalIntentSignals: number;
  veryStrongCount: number;
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  /** Unanalyzed signals counted as strong because of commercial wording ("buy", "guide"...). */
  wordingOnlyCount?: number;
  sampleQuotes: Array<{
    quote: string;
    url?: string | null;
    source?: string;
    intentLevel?: string;
  }>;
}

export interface MarketplaceActivityData {
  productsCount: number;
  platforms: Record<string, number>;
  priceRange: string | null;
  sampleProducts: Array<{
    title: string;
    platform: string;
    price?: string | null;
    url?: string | null;
  }>;
}

export interface CompetitiveDensityData {
  densityRating: "low" | "moderate" | "high" | "unobserved";
  score: number | null;
  competitorsObserved: number;
}

export interface MarketOverview {
  query: string;
  runId?: string;
  mode: "explore" | "validate";
  searchedAt: string;
  matchedMarketsCount: number;
  matchedSignalsCount: number;
  confidence: number; // 0..1

  // The 9 PRD §8 Overview Dimensions
  sizeProxy: OverviewMetric<SizeProxyData>;
  searchInterest: OverviewMetric<SearchInterestData>;
  trendDirection: OverviewMetric<TrendDirectionData>;
  discussionCounts: OverviewMetric<DiscussionCountsData>;
  buyerIntentSignals: OverviewMetric<BuyerIntentData>;
  marketplaceActivity: OverviewMetric<MarketplaceActivityData>;
  competitiveDensity: OverviewMetric<CompetitiveDensityData>;
  pains: OverviewMetric<{ items: PainPoint[] }>;
  underservedSubmarkets: OverviewMetric<{ items: UnderservedSubmarket[] }>;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  mode: "explore" | "validate" | "hunt" | "deep" | "monitor";
  status: string;
  started_at: string;
  completed_at?: string | null;
  user_id?: string | null;
}
