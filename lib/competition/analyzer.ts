// lib/competition/analyzer.ts — Core competition analysis pipeline per PRD §20 & §21.
// Connects competitor extraction, landscape clustering, and review mining.

import type {
  CompetitionAnalysisResult,
  CompetitorProduct,
} from "./types.ts";
import { calculateLandscape } from "./landscape.ts";
import { mineReviewsAndGaps, type ReviewSourceSignal } from "./review-miner.ts";

export interface AnalyzeCompetitionInput {
  competitors: CompetitorProduct[];
  signals?: ReviewSourceSignal[];
}

export function analyzeCompetition(input: AnalyzeCompetitionInput): CompetitionAnalysisResult {
  const competitors = input.competitors || [];
  const signals = input.signals || [];

  const landscape = calculateLandscape(competitors);
  const { reviewMining, productGaps } = mineReviewsAndGaps(competitors, signals);

  return {
    competitors,
    landscape,
    reviewMining,
    productGaps,
  };
}
