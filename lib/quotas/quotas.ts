// lib/quotas/quotas.ts — plans, limits and the quota decision (Phase 5 Part 5.1, PRD §49).

import { COST_CEILING_USD } from "../usage/cost.ts";
// Pure: the counting store is passed in, so the rules are tested without a database.

export type Plan = "anon" | "free" | "premium";
export type UsageKind = "search" | "exploration" | "check" | "deep";
export const USAGE_KINDS: UsageKind[] = ["search", "exploration", "check", "deep"];
export type QuotaWindow = "day" | "month";

export interface Limit {
  max: number;
  window: QuotaWindow;
}

// Caps follow Part 5.1 for anon and the free Deep and idea-scan numbers (about 5 and 1 a month). Every
// cap is checked against a monthly hosted-cost budget per plan (PLAN_BUDGET_USD, with the per-action
// ceilings in lib/usage/cost.ts): see worstCaseMonthlyUsd and its test. The ceilings are design
// bounds, not measurements, until the ledger holds real hosted Deep runs (docs/AI-ROUTER.md).
export const LIMITS: Record<Plan, Record<UsageKind, Limit>> = {
  anon: {
    search: { max: 3, window: "day" },
    exploration: { max: 0, window: "month" },
    check: { max: 0, window: "month" },
    deep: { max: 0, window: "month" },
  },
  free: {
    search: { max: 20, window: "day" },
    exploration: { max: 5, window: "month" },
    check: { max: 20, window: "month" },
    deep: { max: 1, window: "month" },
  },
  premium: {
    search: { max: 200, window: "day" },
    exploration: { max: 100, window: "month" },
    check: { max: 300, window: "month" },
    deep: { max: 12, window: "month" },
  },
};

/** The most the project may pay for one person's hosted use in a month, in USD. */
export const PLAN_BUDGET_USD: Record<Plan, number> = { anon: 0.05, free: 1, premium: 12 };

/** Cost if a person used every limit to the top for a 31-day month. */
export function worstCaseMonthlyUsd(plan: Plan): number {
  let total = 0;
  for (const kind of USAGE_KINDS) {
    const { max, window } = LIMITS[plan][kind];
    total += max * (window === "day" ? 31 : 1) * COST_CEILING_USD[kind];
  }
  return Math.round(total * 1e6) / 1e6;
}

// How many markets, seeds and ideas a watchlist holds in all (Part 4.1). Not a usage window: it is
// rows kept. A saved row is never re-scanned automatically, so a row costs storage and no model
// call; the caps stay at 25 and 250 on that basis (reviewed in Part 5.3).
export const WATCHLIST_LIMIT: Record<Plan, number> = { anon: 0, free: 25, premium: 250 };

export const KIND_LABEL: Record<UsageKind, string> = {
  search: "searches",
  exploration: "idea scans",
  check: "competition checks and section notes",
  deep: "Deep runs",
};

const PLAN_LABEL: Record<Plan, string> = { anon: "Signed-out", free: "Free plan", premium: "Premium plan" };

/** Quotas reset at midnight UTC (day) or on the 1st at midnight UTC (month). */
export function windowStart(window: QuotaWindow, now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), window === "day" ? now.getUTCDate() : 1));
}

export function windowEnd(window: QuotaWindow, now: Date): Date {
  return window === "day"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export interface QuotaState {
  plan: Plan;
  kind: UsageKind;
  limit: number;
  used: number;
  remaining: number;
  window: QuotaWindow;
  /** ISO time of the next reset (UTC). */
  resetsAt: string;
}

export function quotaState(plan: Plan, kind: UsageKind, used: number, now: Date = new Date()): QuotaState {
  const { max, window } = LIMITS[plan][kind];
  return { plan, kind, limit: max, used, remaining: Math.max(0, max - used), window, resetsAt: windowEnd(window, now).toISOString() };
}

/**
 * Who is calling. `internal` is the server key (scripts, jobs) and `local` is a signed-out caller
 * on a dev server; neither is counted. Everyone else is counted under their plan.
 */
export interface Caller {
  plan: Plan | "internal" | "local";
  userId: string | null;
  anonHash: string | null;
  email: string | null;
}

export interface UsageStore {
  count(caller: Caller, kind: UsageKind, since: Date): Promise<number>;
  /**
   * Counts the caller's actions since `since` and, when there are fewer than `max`, records one
   * more, as one step: two requests at the limit cannot both pass. `usageId` is the new row (a
   * failed action is refunded by it) or null when the limit is reached; `used` is the count after.
   */
  take(caller: Caller, kind: UsageKind, since: Date, max: number): Promise<{ usageId: string | null; used: number }>;
  /** Deletes a recorded action: the work it paid for failed and gave the caller nothing. */
  remove(id: string): Promise<void>;
}

export type QuotaDecision =
  | { ok: true; quota: QuotaState | null; usageId: string | null }
  | { ok: false; status: 401 | 429; error: string; quota: QuotaState | null };

const resetDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Checks the caller's quota for one action and, when allowed, records the action.
 * `internal` as the kind marks a pipeline endpoint only the server key may call.
 */
export async function decide(
  caller: Caller,
  kind: UsageKind | "internal",
  store: UsageStore,
  now: Date = new Date(),
): Promise<QuotaDecision> {
  if (caller.plan === "internal") return { ok: true, quota: null, usageId: null };
  if (kind === "internal") return { ok: false, status: 401, error: "This endpoint needs the internal API key.", quota: null };
  if (caller.plan === "local") return { ok: true, quota: null, usageId: null };

  const { max, window } = LIMITS[caller.plan][kind];
  if (max === 0) {
    const free = LIMITS.free[kind];
    return {
      ok: false,
      status: 401,
      error: `Sign in to use ${KIND_LABEL[kind]}. The free plan includes ${free.max} a ${free.window}.`,
      quota: quotaState(caller.plan, kind, 0, now),
    };
  }
  const { usageId, used } = await store.take(caller, kind, windowStart(window, now), max);
  if (!usageId) {
    const quota = quotaState(caller.plan, kind, used, now);
    return {
      ok: false,
      status: 429,
      error: `${PLAN_LABEL[caller.plan]} limit reached: ${used} of ${max} ${KIND_LABEL[kind]} used this ${window}. Resets ${resetDate(quota.resetsAt)} (UTC).${caller.plan === "anon" ? " Sign in for more." : caller.plan === "free" ? ` Premium allows ${LIMITS.premium[kind].max} a ${LIMITS.premium[kind].window}: see your account.` : ""}`,
      quota,
    };
  }
  return { ok: true, quota: quotaState(caller.plan, kind, used, now), usageId };
}
