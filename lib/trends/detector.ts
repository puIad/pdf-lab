// lib/trends/detector.ts — Normative Trend Detection & Multi-Window Delta Algorithm.
// Specs: docs/02-MASTER-PLAN.md (§22–§23), docs/05-PIPELINE-SCORING.md & Phase 3.3.
// Enforces QC Rule 2: No trend claim without temporal evidence.

import type {
  TimeWindow,
  TopicTrendAnalysis,
  TrendClassification,
  TrendWindowMetrics,
} from "./types.ts";
import { evaluatePdfSuitability } from "../scoring/pdf-suitability.ts";
import { analyzeMarketGaps } from "./gaps.ts";
import { checkTopicSeasonality } from "./seasonality.ts";

export interface SignalRecord {
  id: string;
  sourceType: string; // 'youtube' | 'reddit' | 'gtrends' | 'web'
  title?: string | null;
  content?: string | null;
  publishedAt: string | Date | number;
  engagement?: {
    upvotes?: number;
    comments?: number;
    [key: string]: unknown;
  } | null;
  intent?: string | null;
  urgency?: string | null;
}

export interface DetectTrendInput {
  marketId: string;
  topicName: string;
  category?: string;
  signals: SignalRecord[];
  competitorCount?: number;
  referenceDate?: Date;
}

const DAY_MS = 86_400_000;
const EPSILON = 2.0;

function toTimestamp(d: string | Date | number): number {
  if (typeof d === "number") return d;
  if (d instanceof Date) return d.getTime();
  const parsed = new Date(d).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function calculateWeightedVolume(sigs: SignalRecord[]): number {
  let total = 0;
  for (const s of sigs) {
    const upvotes = typeof s.engagement?.upvotes === "number" ? s.engagement.upvotes : 0;
    const comments = typeof s.engagement?.comments === "number" ? s.engagement.comments : 0;
    const rawEng = upvotes + 2 * comments;

    let intentWeight = 0.5;
    if (s.intent === "very_strong") intentWeight = 1.0;
    else if (s.intent === "strong") intentWeight = 0.8;
    else if (s.intent === "medium") intentWeight = 0.6;
    else if (s.intent === "weak") intentWeight = 0.35;

    total += (1 + Math.log1p(Math.max(0, rawEng))) * intentWeight;
  }
  return Math.round(total * 10) / 10;
}

export function detectTopicTrend(input: DetectTrendInput): TopicTrendAnalysis {
  const now = input.referenceDate ? input.referenceDate.getTime() : Date.now();
  const competitorCount = input.competitorCount || 0;
  const category = input.category || "general";

  // 1. Slice signals into multi-temporal windows
  const sigs7d = input.signals.filter((s) => toTimestamp(s.publishedAt) >= now - 7 * DAY_MS);
  const sigsPrior7d = input.signals.filter((s) => {
    const t = toTimestamp(s.publishedAt);
    return t >= now - 14 * DAY_MS && t < now - 7 * DAY_MS;
  });

  const sigs30d = input.signals.filter((s) => toTimestamp(s.publishedAt) >= now - 30 * DAY_MS);
  const sigsPrior30d = input.signals.filter((s) => {
    const t = toTimestamp(s.publishedAt);
    return t >= now - 60 * DAY_MS && t < now - 30 * DAY_MS;
  });

  const sigs90d = input.signals.filter((s) => toTimestamp(s.publishedAt) >= now - 90 * DAY_MS);
  const sigs12m = input.signals.filter((s) => toTimestamp(s.publishedAt) >= now - 365 * DAY_MS);

  // 2. Calculate volumes & velocities
  const v7d = calculateWeightedVolume(sigs7d);
  const vPrior7d = calculateWeightedVolume(sigsPrior7d);
  const v30d = calculateWeightedVolume(sigs30d);
  const vPrior30d = calculateWeightedVolume(sigsPrior30d);
  const v90d = calculateWeightedVolume(sigs90d);
  const v12m = calculateWeightedVolume(sigs12m);

  // 3. Compute rates of change
  const wowDeltaPercent = Math.round((((v7d - vPrior7d) / Math.max(vPrior7d, EPSILON)) * 100) * 10) / 10;
  const momDeltaPercent = Math.round((((v30d - vPrior30d) / Math.max(vPrior30d, EPSILON)) * 100) * 10) / 10;
  // Compare daily rates for meaningful acceleration (H-7)
  const weeklyRate = v7d / 7;
  const monthlyRate = v30d / 30;
  const acceleration = Math.round((weeklyRate - monthlyRate) * 100) / 100;

  // 4. Source metrics breakdown
  const buildWindowMetrics = (window: TimeWindow, sigs: SignalRecord[], days: number, vol: number): TrendWindowMetrics => {
    const ytCount = sigs.filter((s) => s.sourceType === "youtube").length;
    const rdCount = sigs.filter((s) => s.sourceType === "reddit").length;
    return {
      window,
      mentionCount: sigs.length,
      weightedVolume: vol,
      velocityPerDay: Math.round((vol / Math.max(1, days)) * 100) / 100,
      youtubeCount: ytCount,
      redditCount: rdCount,
    };
  };

  const windows: Record<TimeWindow, TrendWindowMetrics> = {
    "7d": buildWindowMetrics("7d", sigs7d, 7, v7d),
    "30d": buildWindowMetrics("30d", sigs30d, 30, v30d),
    "90d": buildWindowMetrics("90d", sigs90d, 90, v90d),
    "12m": buildWindowMetrics("12m", sigs12m, 365, v12m),
  };

  // 5. Market gap analysis
  const gapSignals = sigs30d.map((s) => ({
    text: `${s.title || ""} ${s.content || ""}`,
    sourceType: s.sourceType,
    intent: s.intent,
    upvotes: s.engagement?.upvotes,
  }));
  const gapSummary = analyzeMarketGaps(gapSignals, competitorCount);

  // 6. PDF Solvability evaluation
  const combinedText = input.signals
    .slice(0, 15)
    .map((s) => `${s.title || ""} ${s.content || ""}`)
    .join(" ");
  const pdfEval = evaluatePdfSuitability({
    problem: `${input.topicName} ${combinedText}`,
  });
  const pdfFitScore = Math.round(pdfEval.score * 100) / 100;
  const solvable = pdfEval.isSuitable && pdfFitScore >= 0.5;

  // 7. Seasonality evaluation
  const seasonality = checkTopicSeasonality(input.topicName, [], input.referenceDate);

  // 8. Source diversity
  const hasYouTube = windows["30d"].youtubeCount > 0;
  const hasReddit = windows["30d"].redditCount > 0;
  const sourceDiversity = hasYouTube && hasReddit ? 1.25 : 1.0;
  const seasonalityDampener = seasonality.isSeasonal ? 0.8 : 1.0;

  // 9. Composite Momentum Score (0..100)
  const rawMomentum =
    (20 * Math.log1p(v7d) +
      0.35 * Math.max(0, wowDeltaPercent) +
      0.25 * Math.max(0, acceleration) +
      15 * gapSummary.gapIndex) *
    sourceDiversity *
    seasonalityDampener;
  const momentumScore = Math.min(100, Math.max(0, Math.round(rawMomentum * 10) / 10));

  // 10. Confidence calculation (Signal count, day span, source diversity)
  const totalObservedDays =
    input.signals.length > 0
      ? (now - Math.min(...input.signals.map((s) => toTimestamp(s.publishedAt)))) / DAY_MS
      : 0;
  let rawConfidence = 0.2;
  if (input.signals.length >= 5) rawConfidence += 0.25;
  if (input.signals.length >= 15) rawConfidence += 0.2;
  if (totalObservedDays >= 14) rawConfidence += 0.15;
  if (hasYouTube && hasReddit) rawConfidence += 0.2;
  const confidence = Math.min(1.0, Math.round(rawConfidence * 100) / 100);

  // 11. Trend Classification
  let classification: TrendClassification = "unknown";
  if (input.signals.length < 3 || confidence < 0.25) {
    classification = "unknown";
  } else if (seasonality.isSeasonal && wowDeltaPercent >= 15) {
    classification = "seasonal";
  } else if (wowDeltaPercent >= 30 && v7d >= 6 && gapSummary.gapIndex >= 1.2) {
    classification = "emerging";
  } else if (wowDeltaPercent >= 15 && momDeltaPercent >= 20 && acceleration > 0) {
    classification = "accelerating";
  } else if (v7d >= 2 && gapSummary.explicitRequestCount >= 1 && competitorCount === 0) {
    classification = "early_signal";
  } else if (Math.abs(wowDeltaPercent) <= 12 && v30d >= 15) {
    classification = "stable";
  } else if (wowDeltaPercent < -15 && momDeltaPercent < -15) {
    classification = "declining";
  } else {
    classification = "stable";
  }

  // 12. Mandate Temporal Evidence (QC Rule 2)
  const signWoW = wowDeltaPercent >= 0 ? "+" : "";
  const signMoM = momDeltaPercent >= 0 ? "+" : "";
  const temporalEvidence: string[] = [
    `7-day volume: ${Math.round(v7d)} weighted mentions (${signWoW}${wowDeltaPercent}% WoW vs prior 7d)`,
    `30-day volume: ${Math.round(v30d)} weighted mentions (${signMoM}${momDeltaPercent}% MoM vs prior 30d)`,
    `Discussion velocity: ${windows["7d"].velocityPerDay} mentions/day in 7d window`,
    `Cross-source distribution: ${windows["30d"].youtubeCount} YouTube comments, ${windows["30d"].redditCount} Reddit posts/comments`,
  ];

  if (seasonality.isSeasonal && seasonality.reasoning) {
    temporalEvidence.push(`Seasonality: ${seasonality.reasoning}`);
  }

  if (gapSummary.identifiedGaps.length > 0) {
    temporalEvidence.push(`Market gap: ${gapSummary.identifiedGaps[0]}`);
  }

  return {
    marketId: input.marketId,
    topicName: input.topicName,
    category,
    classification,
    windows,
    wowDeltaPercent,
    momDeltaPercent,
    acceleration,
    momentumScore,
    gapIndex: gapSummary.gapIndex,
    pdfFitScore,
    recommendedFormats: pdfEval.recommendedFormats,
    solvable,
    confidence,
    evidenceCount: input.signals.length,
    temporalEvidence,
    topPainQuote: gapSummary.topPainQuote,
  };
}
