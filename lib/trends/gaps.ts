// lib/trends/gaps.ts — Market Gap & Frustration Miner.
// Detects missing explanations, outdated tutorials, and explicit requests for
// guides/checklists across collected YouTube comments and Reddit posts.

export interface GapSignalInput {
  text: string;
  sourceType: string;
  intent?: string | null;
  upvotes?: number;
}

export interface MarketGapSummary {
  gapIndex: number;
  frustrationCount: number;
  explicitRequestCount: number;
  topPainQuote?: string;
  identifiedGaps: string[];
}

const EXPLICIT_REQUEST_PATTERNS = [
  /(?:is there a|any|where can i find|need a|looking for a|wish there was a)\s+(?:pdf|guide|checklist|template|cheatsheet|cheat sheet|workflow|roadmap|step[- ]by[- ]step)/i,
  /(?:can someone make|please make|someone should write|would pay for a)\s+(?:guide|tutorial|pdf|checklist|breakdown|summary)/i,
  /(?:link to the|where is the)\s+(?:notes|slides|document|spreadsheet|summary|cheat sheet)/i,
];

const TUTORIAL_FRICTION_PATTERNS = [
  /(?:skipped the part|doesn't explain|didn't explain|glossed over|skips step)/i,
  /(?:still confused about|completely stuck on|can't figure out|makes no sense)/i,
  /(?:doesn't work when|fails with error|outdated tutorial|this is obsolete)/i,
  /(?:waste of time|spent hours trying to|nothing works)/i,
];

export function analyzeMarketGaps(
  signals: GapSignalInput[],
  competitorCount: number = 0
): MarketGapSummary {
  let frustrationCount = 0;
  let explicitRequestCount = 0;
  let bestQuote: string | undefined;
  let maxQuoteEngagement = -1;
  const identifiedGaps: string[] = [];

  for (const sig of signals) {
    const text = sig.text || "";
    let isRequest = false;
    let isFriction = false;

    for (const pattern of EXPLICIT_REQUEST_PATTERNS) {
      if (pattern.test(text)) {
        isRequest = true;
        break;
      }
    }

    for (const pattern of TUTORIAL_FRICTION_PATTERNS) {
      if (pattern.test(text)) {
        isFriction = true;
        break;
      }
    }

    if (isRequest) explicitRequestCount++;
    if (isFriction) frustrationCount++;

    const engagement = sig.upvotes || 0;
    if ((isRequest || isFriction) && engagement > maxQuoteEngagement && text.length > 20) {
      maxQuoteEngagement = engagement;
      bestQuote = text.length > 140 ? `${text.slice(0, 137)}...` : text;
    }
  }

  if (explicitRequestCount > 0) {
    identifiedGaps.push(`${explicitRequestCount} explicit requests for structured checklists/guides`);
  }
  if (frustrationCount > 0) {
    identifiedGaps.push(`${frustrationCount} comments noting skipped tutorial steps or unaddressed roadblocks`);
  }
  if (competitorCount === 0 && (explicitRequestCount > 0 || frustrationCount > 0)) {
    identifiedGaps.push("Zero dedicated commercial guides observed in marketplaces (uncontested space)");
  }

  // Market Gap Index = (frustrations + 1.5 * requests) / max(1, competitorCount)
  const rawGap = (frustrationCount + 1.5 * explicitRequestCount) / Math.max(1, competitorCount);
  const gapIndex = Math.round(rawGap * 10) / 10;

  return {
    gapIndex,
    frustrationCount,
    explicitRequestCount,
    topPainQuote: bestQuote,
    identifiedGaps,
  };
}
