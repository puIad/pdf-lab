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
  demand: number; // 0..100 (evidence-derived from signal counts & engagement)
  trendMomentum: number; // multiplier e.g. 0.75..1.35
  problemFrequency: number; // normalized frequency 0..1 based on signal volume
  buyerIntent: number; // 0.25..1.0 (weighted average of intent ladder)
  pdfSuitability: number; // 0..1 (evaluated per PRD §17)
  competitiveDensity: number; // >= 1.0 denominator
}

export interface MarketScoreResult {
  score: number; // 0..100 (never pseudo-science, always accompanied by confidence & count)
  confidence: number; // 0..1 (PRD §54: LOW when data thin)
  evidenceCount: number;
  trend: TrendDirection;
  factors: ScoreFactors;
}

export interface PdfSuitabilityEvaluation {
  score: number; // 0..1
  isSuitable: boolean; // score >= 0.40
  recommendedFormats: string[]; // checklist | guide | cheat-sheet | planner | workbook | template
  reasons: string[];
}
