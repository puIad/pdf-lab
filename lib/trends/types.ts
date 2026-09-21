// lib/trends/types.ts — Normative types for Trend Detection & Market Radar.
// Specs: docs/02-MASTER-PLAN.md (§22–§25) & Phase 3.3.

export type TimeWindow = "7d" | "30d" | "90d" | "12m";

export type TrendClassification =
  | "emerging"
  | "accelerating"
  | "early_signal"
  | "seasonal"
  | "stable"
  | "declining"
  | "unknown";

export interface TrendWindowMetrics {
  window: TimeWindow;
  mentionCount: number;
  weightedVolume: number;
  velocityPerDay: number;
  youtubeCount: number;
  redditCount: number;
}

export interface TopicTrendAnalysis {
  marketId: string;
  topicName: string;
  category: string;
  classification: TrendClassification;
  windows: Record<TimeWindow, TrendWindowMetrics>;
  wowDeltaPercent: number; // Week-over-week % change
  momDeltaPercent: number; // Month-over-month % change
  acceleration: number; // Derivative of velocity change
  momentumScore: number; // 0..100 composite momentum
  gapIndex: number; // Ratio of unmet needs/frustrations to existing solutions
  pdfFitScore: number; // 0..1 from evaluatePdfSuitability
  recommendedFormats: string[]; // e.g. ["checklist", "diagnostic_flowchart"]
  solvable: boolean; // pdfFitScore >= 0.65
  confidence: number; // 0..1
  evidenceCount: number;
  temporalEvidence: string[]; // QC Rule 2: Mandated temporal proof
  topPainQuote?: string;
}

export interface RadarCoordinates {
  radius: number; // 0.0 (center = emerging) to 1.0 (outer = established)
  angleDegrees: number; // 0..360 (clustered by category sector)
  x: number; // Cartesian projection inside 0..100 coordinate box
  y: number;
  dotSize: number; // Scaled diameter (4px to 22px)
  velocityColor: string; // Hex color (Emerald, Violet, Amber, Cyan, Slate)
  deltaArrow: {
    direction: "inward" | "outward" | "stable";
    magnitude: number;
    label: string;
    dx: number;
    dy: number;
  };
}

export interface RadarNode {
  analysis: TopicTrendAnalysis;
  coordinates: RadarCoordinates;
}

export interface RadarSnapshot {
  window: TimeWindow;
  snapshotAt: string;
  nodes: RadarNode[];
  summary: {
    totalTopics: number;
    emergingCount: number;
    acceleratingCount: number;
    seasonalCount: number;
    solvableCount: number;
    avgMomentum: number;
  };
}

export interface SeasonalSurgeForecast {
  topicName: string;
  category: string;
  expectedSurgeWindowDays: number; // e.g. 30..60 days
  peakCalendarMonth: string; // e.g. "November"
  historicalEvidence: string;
  actionRecommendation: string;
}

export interface RadarFilterOptions {
  source?: "all" | "youtube" | "reddit";
  category?: string;
  minConfidence?: number;
  solvableOnly?: boolean;
  search?: string;
}
