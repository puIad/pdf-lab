// lib/trends/service.ts — High-level Trend & Radar Service.
// Runs trend detection over topics loaded from stored rows (see load.ts).

import type {
  RadarFilterOptions,
  RadarSnapshot,
  SeasonalSurgeForecast,
  TimeWindow,
  TopicTrendAnalysis,
} from "./types.ts";
import { CONFIDENT_TREND_SIGNALS, detectTopicTrend, MIN_TREND_SIGNALS, type SignalRecord } from "./detector.ts";
import { buildRadarSnapshot } from "./radar-calculator.ts";
import { predictUpcomingSeasonalSurges } from "./seasonality.ts";

export interface MarketTopicData {
  id: string;
  name: string;
  category: string;
  signals: SignalRecord[];
  competitorCount: number;
}

/** Empty-state line for a radar with no classifiable market: the stored counts, never a sample. */
export function thinRadarMessage(topics: MarketTopicData[]): string {
  const signals = topics.reduce((n, t) => n + t.signals.length, 0);
  return `${signals} dated ${signals === 1 ? "signal is" : "signals are"} stored across ${topics.length} ${topics.length === 1 ? "market" : "markets"}. A market needs ${CONFIDENT_TREND_SIGNALS} dated signals before the radar shows a trend, or ${MIN_TREND_SIGNALS} when the oldest is at least two weeks old or YouTube and Reddit both appear in the last 30 days.`;
}

export class TrendingRadarService {
  private topics: MarketTopicData[];

  // Topics come from stored rows (`loadStoredMarketTopics`); there are no built-in defaults.
  constructor(topics: MarketTopicData[]) {
    this.topics = topics;
  }

  /**
   * Run trend detection across all topics and return analyses.
   */
  getAnalyzedTopics(options: RadarFilterOptions = {}): TopicTrendAnalysis[] {
    const analyses: TopicTrendAnalysis[] = [];

    for (const topic of this.topics) {
      // Optional category filter
      if (options.category && options.category !== "all") {
        if (topic.category.toLowerCase() !== options.category.toLowerCase()) {
          continue;
        }
      }

      // Optional text search filter
      if (options.search && options.search.trim() !== "") {
        const q = options.search.toLowerCase();
        if (!topic.name.toLowerCase().includes(q)) {
          continue;
        }
      }

      // Filter signals by source if requested
      let signals = topic.signals;
      if (options.source && options.source !== "all") {
        signals = signals.filter((s) => s.sourceType === options.source);
      }

      const analysis = detectTopicTrend({
        marketId: topic.id,
        topicName: topic.name,
        category: topic.category,
        signals,
        competitorCount: topic.competitorCount,
      });

      // Filter by confidence
      if (options.minConfidence !== undefined && analysis.confidence < options.minConfidence) {
        continue;
      }

      // Filter by solvable only
      if (options.solvableOnly && !analysis.solvable) {
        continue;
      }

      analyses.push(analysis);
    }

    // Sort by momentum score descending
    return analyses.sort((a, b) => b.momentumScore - a.momentumScore);
  }

  /** False when every topic is "unknown": too few dated signals to plot a radar (QC Rule 2). */
  hasTrend(): boolean {
    return this.getAnalyzedTopics().some((a) => a.classification !== "unknown");
  }

  /**
   * Builds synchronized snapshots for all 4 windows.
   */
  getFourWindowSnapshots(options: RadarFilterOptions = {}): Record<TimeWindow, RadarSnapshot> {
    const { plotted, notPlotted } = this.plottable(options);
    const snapshot = (window: TimeWindow) => withNotPlotted(buildRadarSnapshot(plotted, window), notPlotted);
    return { "7d": snapshot("7d"), "30d": snapshot("30d"), "90d": snapshot("90d"), "12m": snapshot("12m") };
  }

  /**
   * A place on the radar is a trend claim, so a market whose trend is "unknown" (too few dated
   * signals, QC Rule 2) is counted but not plotted (issue #51).
   */
  private plottable(options: RadarFilterOptions): { plotted: TopicTrendAnalysis[]; notPlotted: number } {
    const analyses = this.getAnalyzedTopics(options);
    const plotted = analyses.filter((a) => a.classification !== "unknown");
    return { plotted, notPlotted: analyses.length - plotted.length };
  }

  /**
   * Retrieves single window snapshot.
   */
  getSnapshot(window: TimeWindow, options: RadarFilterOptions = {}): RadarSnapshot {
    const { plotted, notPlotted } = this.plottable(options);
    return withNotPlotted(buildRadarSnapshot(plotted, window), notPlotted);
  }

  /**
   * Calculates comparative delta between two windows for a target market.
   */
  getTopicDelta(marketId: string, base: TimeWindow = "7d", target: TimeWindow = "30d") {
    const analyses = this.getAnalyzedTopics();
    const item = analyses.find((a) => a.marketId === marketId);
    if (!item) return null;

    const baseMetrics = item.windows[base];
    const targetMetrics = item.windows[target];

    const volumeShiftPercent =
      baseMetrics && targetMetrics
        ? Math.round(
            ((baseMetrics.velocityPerDay - targetMetrics.velocityPerDay) /
              Math.max(0.1, targetMetrics.velocityPerDay)) *
              1000
          ) / 10
        : 0;

    return {
      marketId: item.marketId,
      topicName: item.topicName,
      classification: item.classification,
      comparison: { base, target },
      baseMetrics,
      targetMetrics,
      velocityDeltaPercent: volumeShiftPercent,
      momentumScore: item.momentumScore,
      temporalEvidence: item.temporalEvidence,
      topPainQuote: item.topPainQuote,
      recommendedFormats: item.recommendedFormats,
    };
  }

  /**
   * Returns top solvable PDF opportunities.
   */
  getSolvableOpportunities(limit: number = 25, minPdfFit: number = 0.65) {
    const analyses = this.getAnalyzedTopics({ solvableOnly: true });
    return analyses
      .filter((a) => a.pdfFitScore >= minPdfFit)
      .slice(0, limit)
      .map((a) => ({
        marketId: a.marketId,
        topicName: a.topicName,
        category: a.category,
        classification: a.classification,
        pdfFitScore: a.pdfFitScore,
        recommendedFormats: a.recommendedFormats,
        momentumScore: a.momentumScore,
        gapIndex: a.gapIndex,
        confidence: a.confidence,
        temporalEvidence: a.temporalEvidence,
        topPainQuote: a.topPainQuote,
      }));
  }

  /**
   * Retrieves upcoming seasonal surges per PRD §24.
   */
  getUpcomingSeasonalSurges(): SeasonalSurgeForecast[] {
    return predictUpcomingSeasonalSurges(new Date(), this.topics.map((t) => t.name));
  }
}


function withNotPlotted(snapshot: RadarSnapshot, notPlotted: number): RadarSnapshot {
  return { ...snapshot, summary: { ...snapshot.summary, notPlotted } };
}
