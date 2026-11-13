// lib/scoring/scoring.ts — Evidence-backed market scoring & confidence formula.
// Normative specs: docs/05-PIPELINE-SCORING.md (§16, §53-§54) & PRD §16, §17.
//
// Formula: score = Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability
// Part 6.11: every factor is a rate, a median, a maximum or a share, so collecting twice as many
// rows for the same seed does not move it much. Competition is not a factor: stored listings are
// shown as raw counts (DEC-010), and the old CompetitiveDensity term was never fed and always 1.
// The result is a rule-based index, always shipped with confidence and the counts behind it.

import type { DemandBasis, MarketScoreResult, ScoreFactors, TrendDirection } from "./types.ts";
import { evaluatePdfSuitability } from "./pdf-suitability.ts";
import { DISCUSSION_ENGAGEMENT_KEYS, TRENDS_INTEREST_KEYS } from "../sources/engagement.ts";

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
  /** Signals clustered in the whole run; the market's share of them is its problem frequency. */
  totalSignals?: number;
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

// shortcut: weights and scales below are first guesses, see docs/research for the calibration note.
const DEMAND_WEIGHTS = { engagement: 35, trends: 35, questions: 15, sources: 15 };
/** A market holding this share of the run's signals has problem frequency 1. */
const FULL_FREQUENCY_SHARE = 0.25;
/** Median engagement at which the engagement component is 1 (log scale). */
const FULL_ENGAGEMENT = 1000;

const QUESTION = /\?|^(how|what|why|when|where|who|which|can|is|are|does|do|should|will|would|could)\b/i;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Engagement of one discussion: only the keys named for its source type, never every number. */
function discussionEngagement(s: SignalScoringItem): number | null {
  const keys = DISCUSSION_ENGAGEMENT_KEYS[s.sourceType.toLowerCase().trim()];
  if (!keys || !s.engagement) return null;
  return keys.reduce((sum, k) => sum + Math.max(0, num(s.engagement![k]) ?? 0), 0);
}

/** Google Trends interest (0..100) of one row; rising rows carry a growth %, not an interest level. */
function trendsInterest(s: SignalScoringItem): number | null {
  if (s.sourceType.toLowerCase().trim() !== "gtrends" || !s.engagement || s.engagement.rising === true) return null;
  for (const k of TRENDS_INTEREST_KEYS) {
    const v = num(s.engagement[k]);
    if (v !== null) return Math.max(0, Math.min(100, v));
  }
  return null;
}

/**
 * Demand 0..100 from four observed quantities that do not depend on how many rows were fetched:
 * the median engagement of a discussion, the highest Trends interest, the share of question
 * phrasings, and how many source types saw the market. Engagement and Trends are skipped when not
 * observed (the weights renormalize), never counted as zero.
 */
export function demandFromSignals(signals: SignalScoringItem[]): { demand: number; basis: DemandBasis } {
  const engagement = signals.map(discussionEngagement).filter((v): v is number => v !== null);
  const interest = signals.map(trendsInterest).filter((v): v is number => v !== null);
  const basis: DemandBasis = {
    medianEngagement: engagement.length ? median(engagement) : null,
    engagementSignals: engagement.length,
    trendsInterest: interest.length ? Math.max(...interest) : null,
    questionShare: Math.round((signals.filter((s) => QUESTION.test((s.title ?? "").trim())).length / signals.length) * 100) / 100,
    sources: new Set(signals.map((s) => s.sourceType.toLowerCase().trim())).size,
  };

  const parts: Array<[number, number]> = [
    [DEMAND_WEIGHTS.questions, basis.questionShare],
    [DEMAND_WEIGHTS.sources, Math.min(1, basis.sources / 3)],
  ];
  if (basis.medianEngagement !== null) {
    parts.push([DEMAND_WEIGHTS.engagement, Math.min(1, Math.log10(basis.medianEngagement + 1) / Math.log10(FULL_ENGAGEMENT + 1))]);
  }
  if (basis.trendsInterest !== null) parts.push([DEMAND_WEIGHTS.trends, basis.trendsInterest / 100]);
  const weight = parts.reduce((n, [w]) => n + w, 0);
  const demand = Math.round((parts.reduce((n, [w, v]) => n + w * v, 0) / weight) * 100);
  return { demand, basis };
}

/**
 * Calculates the evidence-backed market score, confidence and factors for a cluster of signals.
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
      analysedCount: 0,
      trend: opts.trend || "unknown",
      demandBasis: { medianEngagement: null, engagementSignals: 0, trendsInterest: null, questionShare: 0, sources: 0 },
      factors: {
        demand: 0,
        trendMomentum: 1.0,
        problemFrequency: 0,
        buyerIntent: 0,
        pdfSuitability: 0,
      },
    };
  }

  // 1. Demand (0..100) from observed quantities (PRD §53 Rule 4)
  const { demand, basis } = demandFromSignals(signals);

  // 2. Problem frequency (0.1..1.0): this market's share of the run's signals, not its raw size.
  const total = Math.max(evidenceCount, opts.totalSignals ?? evidenceCount);
  const problemFrequency = Math.min(1.0, Math.max(0.1, evidenceCount / total / FULL_FREQUENCY_SHARE));

  // 3. Buyer intent: mean over ANALYSED signals only. An unanalysed signal says nothing about
  // intent; it is not a weak one. No analysed signal = intent not observed = 0.
  const analysed = signals.filter((s) => s.analysis?.intent);
  const buyerIntent = analysed.length
    ? Math.round(
        (analysed.reduce((sum, s) => sum + (INTENT_WEIGHTS[s.analysis!.intent!.toLowerCase().trim()] ?? 0.35), 0) /
          analysed.length) *
          100,
      ) / 100
    : 0;

  // 4. PDF Suitability (0..1)
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

  // 5. Trend Momentum
  const trend: TrendDirection = opts.trend || "unknown";
  const trendMomentum = TREND_MOMENTUM[trend] ?? 1.0;

  // 6. Overall: Demand × TrendMomentum × ProblemFrequency × BuyerIntent × PDFSuitability
  const rawScore = demand * trendMomentum * problemFrequency * buyerIntent * pdfSuitability;
  const score = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  // 7. Confidence (0..1) — PRD §54: LOW when data thin. Volume and source diversity belong here:
  // more rows make the index more trustworthy, not the market bigger.
  const volumeFactor = Math.min(1.0, evidenceCount / 15);
  const diversityFactor = Math.min(1.0, basis.sources / 3);
  let rawConfidence = 0.6 * volumeFactor + 0.4 * diversityFactor;

  // Hard safety gates for thin data
  if (evidenceCount < 3) {
    rawConfidence = Math.min(0.35, rawConfidence);
  }
  if (basis.sources === 1) {
    rawConfidence = Math.min(0.5, rawConfidence);
  }
  const confidence = Math.max(0.05, Math.min(1.0, Math.round(rawConfidence * 100) / 100));

  const factors: ScoreFactors = {
    demand,
    trendMomentum,
    problemFrequency: Math.round(problemFrequency * 100) / 100,
    buyerIntent,
    pdfSuitability,
  };

  return {
    score,
    confidence,
    evidenceCount,
    analysedCount: analysed.length,
    trend,
    demandBasis: basis,
    factors,
  };
}
