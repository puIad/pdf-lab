// lib/scoring/types.ts — Scoring & PDF suitability types (Phase 1 Part 1.4).
// Normative specs: docs/05-PIPELINE-SCORING.md (§16, §53-§54) & PRD §17.

export type TrendDirection =
  | "emerging"
  | "accelerating"
  | "seasonal"
  | "stable"
  | "declining"
  | "unknown";

export interface ScoreFactors {
  demand: number; // 0..100, from `DemandBasis` (independent of how many rows were fetched)
  trendMomentum: number; // multiplier e.g. 0.75..1.35
  problemFrequency: number; // 0.1..1: the market's share of the run's signals
  buyerIntent: number; // 0.35..1.0 mean over analysed signals; 0 when none is analysed
  pdfSuitability: number; // 0..1 (evaluated per PRD §17)
}

/** The observed quantities behind `factors.demand`. Show these before the index (Part 6.11). */
export interface DemandBasis {
  /** Median reactions (source-specific keys) of a discussion; null when no such source is present. */
  medianEngagement: number | null;
  engagementSignals: number;
  /** Highest Google Trends interest (0..100) among the market's Trends rows; null when none. */
  trendsInterest: number | null;
  /** Share of signals whose title is phrased as a question. */
  questionShare: number;
  /** Distinct source types. */
  sources: number;
}

export interface MarketScoreResult {
  score: number; // 0..100 (never pseudo-science, always accompanied by confidence & count)
  confidence: number; // 0..1 (PRD §54: LOW when data thin)
  evidenceCount: number;
  /** Signals with a stored intent: buyer intent is "n analysed of m". */
  analysedCount: number;
  trend: TrendDirection;
  demandBasis: DemandBasis;
  factors: ScoreFactors;
}

export interface PdfSuitabilityEvaluation {
  score: number; // 0..1
  isSuitable: boolean; // score >= 0.40
  recommendedFormats: string[]; // checklist | guide | cheat-sheet | planner | workbook | template
  reasons: string[];
}
