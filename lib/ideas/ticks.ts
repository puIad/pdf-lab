// lib/ideas/ticks.ts — per-card ticks (Phase 3 Part 3.8): each one shows its threshold and the count
// behind it. The competition tick stays blank until a Part 3.9 check stores observed listings (QC Rule 3).

import type { QuickIdea } from "./ideas.ts";

export type TickStatus = "pass" | "fail" | "blank";

export interface IdeaTick {
  key: "demand" | "trend" | "fit" | "effort" | "competition";
  label: string;
  status: TickStatus;
  count: string;
  threshold: string;
}

/** Observed listings from a 3.9 competition check; absent until one has run. */
export interface CompetitionCount {
  listings: number;
}

// shortcut: uncalibrated thresholds; refit in Part 3.11.
export const TICK_THRESHOLDS = { demand: 50, fit: 60, listingsMax: 30 } as const;

export function ideaTicks(idea: QuickIdea, competition: CompetitionCount | null = null): IdeaTick[] {
  const T = TICK_THRESHOLDS;
  return [
    {
      key: "demand",
      label: "Demand",
      status: idea.demand >= T.demand ? "pass" : "fail",
      count: `${idea.demand}/100: ${idea.demandBasis}`,
      threshold: `≥ ${T.demand}`,
    },
    {
      key: "trend",
      label: "Trend",
      // No rising data is "not observed", not a failure (QC Rule 2).
      status: idea.trend ? "pass" : "blank",
      count: idea.trendBasis ?? "no Google Trends rising data for this phrase",
      threshold: "listed as rising or breakout",
    },
    {
      key: "fit",
      label: "PDF fit",
      status: idea.fit >= T.fit ? "pass" : "fail",
      count: `${idea.fit}/100 (${idea.format.toLowerCase()}, ${idea.intent})`,
      threshold: `≥ ${T.fit}`,
    },
    {
      key: "effort",
      label: "Effort",
      status: idea.effort === "Hard" ? "fail" : "pass",
      count: `${idea.effort} (${idea.format.toLowerCase()})`,
      threshold: "Easy or Medium",
    },
    {
      key: "competition",
      label: "Competition",
      status: competition === null ? "blank" : competition.listings <= T.listingsMax ? "pass" : "fail",
      count: competition === null ? "not checked yet" : `${competition.listings} listings observed`,
      threshold: `≤ ${T.listingsMax} listings`,
    },
  ];
}
