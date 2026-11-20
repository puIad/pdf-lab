// lib/launch/cost-model.ts — dollars per run and the monthly projection (Phase 6 Part 6.3, PRD §49,
// §57). Pure: the numbers below are inputs with their source named, so the table in docs/LAUNCH.md
// can be rebuilt and checked. Nothing here reads a bill: until the usage ledger (Part 5.2) holds
// real rows, the AI cost is an estimate from token counts and list prices, and the search cost is
// a count of calls the code makes times the vendor's list price.

import { LIMITS, type Plan, type UsageKind } from "../quotas/quotas.ts";

/** Serper pay-as-you-go list price per call (DEC-002: about $1 per 1,000 down to $0.30 at volume). */
export const SERPER_USD_PER_CALL = 0.001;

/**
 * Serper calls one action makes. Each marketplace adapter and the web adapter make exactly one
 * call per collect (checked by lib/launch/cost-model.test.ts); a competition check runs Etsy,
 * Gumroad and KDP (docs/research/2026-11-13-score-calibration.md: 89 calls for 5 seed scans and
 * 28 new checks, so 3 per check); a Deep run ingests web, Etsy, Gumroad and KDP; an idea scan runs
 * the web adapter for phrases, Google Trends and Wikipedia (the last two make no Serper call).
 * A stored-data search makes none.
 */
export const SERPER_CALLS: Record<UsageKind, number> = { search: 0, exploration: 1, check: 3, deep: 4 };

/**
 * Hosted AI dollars one action costs. Only a Deep run calls a model in volume: about 100 signals
 * is 10 extraction calls (batches of 10, Part 6.9), about 8 naming calls, one opportunity call and
 * one embedding call. At $0.075 per million input tokens and $0.25 per million output tokens
 * (DEC-012, the paid `nex-agi/nex-n2.5-pro` price) that is about $0.01. A competition check or a
 * section note is one short cheap-tier call, under $0.001, counted as 0 here.
 */
export const AI_USD: Record<UsageKind, number> = { search: 0, exploration: 0, check: 0, deep: 0.01 };

export type KeyMode = "free" | "byok" | "premium";

/** Who pays the AI: free runs use free-tier models ($0), BYOK runs bill the person's key, premium bills the project. */
export function projectAiShare(mode: KeyMode): number {
  return mode === "premium" ? 1 : 0;
}

/** What the project pays for one action, in dollars. */
export function projectCostPerAction(kind: UsageKind, mode: KeyMode): number {
  return SERPER_CALLS[kind] * SERPER_USD_PER_CALL + AI_USD[kind] * projectAiShare(mode);
}

/** What the person's own key pays for one action (BYOK only). */
export function userKeyCostPerAction(kind: UsageKind, mode: KeyMode): number {
  return mode === "byok" ? AI_USD[kind] : 0;
}

/** The project's monthly cost for one person who uses every counted action up to the plan's limit. */
export function monthlyCostAtLimit(plan: Exclude<Plan, "anon">, mode: KeyMode): number {
  let total = 0;
  for (const kind of Object.keys(LIMITS[plan]) as UsageKind[]) {
    const { max, window } = LIMITS[plan][kind];
    const perMonth = window === "day" ? max * 30 : max;
    total += perMonth * projectCostPerAction(kind, mode);
  }
  return total;
}

export interface ProjectionAssumptions {
  /** Share of signed-up people who use the product in a month. */
  activeShare: number;
  /** Share of active people on the premium plan. */
  premiumShare: number;
  /** How much of a plan's limit an active person uses, 0 to 1. */
  limitUse: number;
}

/** Worst case for the limits as they stand: everyone active, using every counted action. */
export const CEILING: ProjectionAssumptions = { activeShare: 1, premiumShare: 0.05, limitUse: 1 };
/** A guess for a launch month; replace it with the metrics dashboard's active-user numbers. */
export const EXPECTED: ProjectionAssumptions = { activeShare: 0.3, premiumShare: 0.05, limitUse: 0.4 };

/** Monthly dollars the project pays for `users` signed-up people. Premium people use the hosted AI. */
export function projectMonthly(users: number, a: ProjectionAssumptions, freeMode: KeyMode = "free"): number {
  const active = users * a.activeShare;
  const premium = active * a.premiumShare;
  const free = active - premium;
  return (free * monthlyCostAtLimit("free", freeMode) + premium * monthlyCostAtLimit("premium", "premium")) * a.limitUse;
}
