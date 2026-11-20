// lib/usage/cost.ts: cost per run from the ledger, and the numbers the plan limits come from
// (Part 5.3). Pure. Ceilings are documented design bounds (docs/AI-ROUTER.md), not measurements:
// the dashboard shows measured cost next to them and flags a run above its ceiling.

import type { UsageKind } from "../quotas/quotas.ts";

export interface RunCost {
  runId: string;
  mode: string | null;
  calls: number;
  totalTokens: number;
  costUsd: number;
  unpricedCalls: number;
}

/** Most one counted action may cost the project, in USD. A run above it is out of bounds. */
export const COST_CEILING_USD: Record<UsageKind, number> = {
  search: 0.0005,
  exploration: 0.02,
  check: 0.01,
  deep: 0.25,
};

export interface CostSummary {
  runs: number;
  /** Runs with at least one unpriced call: their cost is a lower bound. */
  partlyUnpriced: number;
  meanUsd: number | null;
  medianUsd: number | null;
  p90Usd: number | null;
  maxUsd: number | null;
  /** Runs whose cost is above the Deep ceiling. */
  overCeiling: RunCost[];
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

/** Summarises runs of one mode (default: Deep). Nothing observed gives nulls, never a made-up figure. */
export function summarizeRuns(runs: RunCost[], mode: string | null = "deep", ceiling = COST_CEILING_USD.deep): CostSummary {
  const rows = runs.filter((r) => mode === null || r.mode === mode);
  if (rows.length === 0) return { runs: 0, partlyUnpriced: 0, meanUsd: null, medianUsd: null, p90Usd: null, maxUsd: null, overCeiling: [] };
  const costs = rows.map((r) => r.costUsd).sort((a, b) => a - b);
  return {
    runs: rows.length,
    partlyUnpriced: rows.filter((r) => r.unpricedCalls > 0).length,
    meanUsd: round(costs.reduce((a, b) => a + b, 0) / costs.length),
    medianUsd: round(quantile(costs, 0.5)),
    p90Usd: round(quantile(costs, 0.9)),
    maxUsd: round(costs[costs.length - 1]),
    overCeiling: rows.filter((r) => r.costUsd > ceiling),
  };
}

export const formatUsd = (n: number) => `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

/**
 * "A deep run costs about $X at current usage": the measured median when at least `minRuns` Deep
 * runs are in the ledger, else the documented ceiling, said as a ceiling. Never a bare invented figure.
 */
export function deepRunCostLine(s: CostSummary, minRuns = 5): string {
  if (s.runs >= minRuns && s.medianUsd !== null) {
    return `A deep run costs about ${formatUsd(s.medianUsd)} at current usage (median of ${s.runs} runs).`;
  }
  return `A deep run costs us at most ${formatUsd(COST_CEILING_USD.deep)} (design ceiling; ${s.runs} measured ${s.runs === 1 ? "run" : "runs"} so far, too few to average).`;
}
