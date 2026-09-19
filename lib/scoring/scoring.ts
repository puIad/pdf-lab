// lib/scoring/scoring.ts — Evidence-backed market scoring & confidence formula.
// Normative specs: docs/05-PIPELINE-SCORING.md (§16, §53-§54) & PRD §16, §17.
//
// Formula: score = Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability ÷ CompetitiveDensity
// Every score is evidence-derived (never arbitrary AI opinion, PRD §53 Rule 4).
// Every score stores/returns { score, confidence, evidence_count }.

import type { MarketScoreResult, ScoreFactors, TrendDirection } from "./types.ts";
import { evaluatePdfSuitability } from "./pdf-suitability.ts";

export interface SignalScoringItem {
  signalId: string;
  sourceType: string; // 'reddit' | 'gtrends' | 'web' | etc.
  title?: string | null;
  content?: string | null;
  engagement?: Record<string, unknown> | null;
  analysis?: {
    audience?: string | null;
    problem?: string | null;
    intent?: string | null; // weak | medium | strong | very_strong
    urgency?: string | null; // low | medium | high
    pdf_relevance?: number | null; // 0..1
  } | null;
}

export interface ScoreMarketOptions {
  trend?: TrendDirection;
  competitiveDensity?: number; // default 1.0 (>= 1.0)
}

const INTENT_WEIGHTS: Record<string, number> = {
  weak: 0.35,
  medium: 0.55,
  strong: 0.8,
  very_strong: 1.0,
};

const TREND_MOMENTUM: Record<TrendDirection, number> = {
  accelerating: 1.35,
  emerging: 1.2,
  stable: 1.0,
  seasonal: 1.0,
  declining: 0.75,
  unknown: 1.0,
};

function extractEngagementTotal(engagement?: Record<string, unknown> | null): number {
  if (!engagement || typeof engagement !== "object") return 0;
  let total = 0;
  for (const val of Object.values(engagement)) {
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      total += val;
    }
  }
  return total;
}

/**
 * Calculates evidence-backed market score, confidence, and factors for a cluster of signals.
 * Monotonic with respect to evidence volume, source diversity, and intent.
 */
export function scoreMarket(
  signals: SignalScoringItem[],
  opts: ScoreMarketOptions = {},
): MarketScoreResult {
  const evidenceCount = signals.length;
  if (evidenceCount === 0) {
    return {
      score: 0,
      confidence: 0,
      evidenceCount: 0,
      trend: opts.trend || "unknown",
      factors: {
        demand: 0,
        trendMomentum: 1.0,
        problemFrequency: 0,
        buyerIntent: 0.25,
        pdfSuitability: 0,
        competitiveDensity: 1.0,
      },
    };
  }

  // 1. Sources & Diversity
  const uniqueSources = new Set(signals.map((s) => s.sourceType.toLowerCase().trim())).size;

  // 2. Problem Frequency (0.1 .. 1.0)
  // Reaches 1.0 at 10+ signals
  const problemFrequency = Math.min(1.0, Math.max(0.1, evidenceCount / 10));

  // 3. Demand (0..100) — derived strictly from volume and engagement (PRD §53 Rule 4)
  const volumeDemand = Math.min(70, evidenceCount * 7);
  const totalEngagement = signals.reduce((sum, s) => sum + extractEngagementTotal(s.engagement), 0);
  const engagementDemand = Math.min(30, Math.log10(totalEngagement + 1) * 10);
  const demand = Math.min(100, Math.round(volumeDemand + engagementDemand));

  // 4. Buyer Intent (0.25..1.0)
  let intentSum = 0;
  for (const s of signals) {
    const rawIntent = (s.analysis?.intent || "weak").toLowerCase().trim();
    intentSum += INTENT_WEIGHTS[rawIntent] ?? 0.35;
  }
  const buyerIntent = Math.round((intentSum / evidenceCount) * 100) / 100;

  // 5. PDF Suitability (0..1)
  let suitabilitySum = 0;
  for (const s of signals) {
    const evalResult = evaluatePdfSuitability({
      problem: s.analysis?.problem || s.title || "",
      audience: s.analysis?.audience,
      extractedRelevance: s.analysis?.pdf_relevance,
    });
    suitabilitySum += evalResult.score;
  }
  const pdfSuitability = Math.round((suitabilitySum / evidenceCount) * 100) / 100;

  // 6. Trend Momentum
  const trend: TrendDirection = opts.trend || "unknown";
  const trendMomentum = TREND_MOMENTUM[trend] ?? 1.0;

  // 7. Competitive Density (>= 1.0)
  const competitiveDensity = Math.max(1.0, opts.competitiveDensity ?? 1.0);

  // 8. Overall formula:
  // score = Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability ÷ CompetitiveDensity
  const rawScore =
    (demand * trendMomentum * problemFrequency * buyerIntent * pdfSuitability) / competitiveDensity;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  // 9. Confidence (0..1) — PRD §54: LOW when data thin
  // Based on volume and source diversity
  const volumeFactor = Math.min(1.0, evidenceCount / 15);
  const diversityFactor = Math.min(1.0, uniqueSources / 3);
  let rawConfidence = 0.6 * volumeFactor + 0.4 * diversityFactor;

  // Hard safety gates for thin data
  if (evidenceCount < 3) {
    rawConfidence = Math.min(0.35, rawConfidence);
  }
  if (uniqueSources === 1) {
    rawConfidence = Math.min(0.5, rawConfidence);
  }
  const confidence = Math.max(0.05, Math.min(1.0, Math.round(rawConfidence * 100) / 100));

  const factors: ScoreFactors = {
    demand,
    trendMomentum,
    problemFrequency: Math.round(problemFrequency * 100) / 100,
    buyerIntent,
    pdfSuitability,
    competitiveDensity,
  };

  return {
    score,
    confidence,
    evidenceCount,
    trend,
    factors,
  };
}
