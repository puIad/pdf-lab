// lib/planner/verdict.ts — Validate verdict GO / WAIT / KILL (Phase 3 Part 3.8, DEC-010).
// Fixed thresholds over stored counts from the market overview. No LLM (QC Rule 4); a count that was
// not observed stays "not_observed" and never counts as a pass (QC Rules 2–3).

import type { MarketOverview } from "../search/types.ts";

export type CheckStatus = "pass" | "weak" | "fail" | "not_observed";
export type Verdict = "GO" | "WAIT" | "KILL";

export interface VerdictCheck {
  key: "demand" | "intent" | "competition" | "trend";
  label: string;
  status: CheckStatus;
  /** The observed count, e.g. "12 discussions". */
  count: string;
  /** The rule it was held against, e.g. "≥ 10 to pass, < 3 kills". */
  threshold: string;
}

export interface ValidationVerdict {
  verdict: Verdict;
  reason: string;
  checks: VerdictCheck[];
}

// shortcut: uncalibrated thresholds; refit in Part 3.11 against the user's PDFMinter scan file.
export const VERDICT_THRESHOLDS = {
  demandPass: 10,
  demandKill: 3,
  intentSharePass: 0.25,
  intentSampleMin: 5,
  competitorsMax: 30,
  trendWindowsMin: 2,
} as const;

const T = VERDICT_THRESHOLDS;

export function buildVerdict(ov: MarketOverview): ValidationVerdict {
  const discussions = ov.discussionCounts.value?.total ?? 0;
  const demand: VerdictCheck = {
    key: "demand",
    label: "Demand",
    status: discussions >= T.demandPass ? "pass" : discussions < T.demandKill ? "fail" : "weak",
    count: `${discussions} discussion${discussions === 1 ? "" : "s"}`,
    threshold: `≥ ${T.demandPass} to pass, < ${T.demandKill} kills`,
  };

  // Analyzed intents only: rows the overview counts as strong for wording alone are left out.
  const bi = ov.buyerIntentSignals.value;
  const wording = bi?.wordingOnlyCount ?? 0;
  const analyzed = bi ? bi.totalIntentSignals - wording : 0;
  const strong = bi ? bi.veryStrongCount + bi.strongCount - wording : 0;
  const share = analyzed > 0 ? strong / analyzed : null;
  const intent: VerdictCheck = {
    key: "intent",
    label: "Buyer intent",
    status:
      share === null ? "not_observed" : share >= T.intentSharePass && analyzed >= T.intentSampleMin ? "pass" : "weak",
    count: share === null ? "no analyzed signals" : `${strong} of ${analyzed} analyzed strong (${Math.round(share * 100)}%)`,
    threshold: `≥ ${T.intentSharePass * 100}% strong or very strong, of ≥ ${T.intentSampleMin} analyzed`,
  };

  const competitors = ov.competitiveDensity.value?.competitorsObserved ?? 0;
  const competition: VerdictCheck = {
    key: "competition",
    label: "Competition",
    status: competitors === 0 ? "not_observed" : competitors > T.competitorsMax ? "fail" : "pass",
    count: `${competitors} competitor${competitors === 1 ? "" : "s"} observed`,
    threshold: `1 to ${T.competitorsMax} (some proof of sales, not crowded)`,
  };

  const td = ov.trendDirection.value;
  const windows = td?.timeWindowsEvaluated ?? 0;
  const trend: VerdictCheck = {
    key: "trend",
    label: "Trend",
    status:
      !td || td.direction === "unknown" || windows < T.trendWindowsMin
        ? "not_observed"
        : td.direction === "declining"
          ? "fail"
          : "pass",
    count: td && td.direction !== "unknown" ? `${td.direction} over ${windows} windows` : `${windows} windows with data`,
    threshold: `≥ ${T.trendWindowsMin} windows, not declining`,
  };

  const checks = [demand, intent, competition, trend];
  const fails = checks.filter((c) => c.status === "fail");
  const passes = checks.filter((c) => c.status === "pass");

  if (demand.status === "fail" || fails.length >= 2) {
    return {
      verdict: "KILL",
      reason:
        demand.status === "fail"
          ? `Only ${demand.count}; below the ${T.demandKill} needed to keep going.`
          : `${fails.map((c) => c.label.toLowerCase()).join(" and ")} failed.`,
      checks,
    };
  }
  if (demand.status === "pass" && intent.status === "pass" && fails.length === 0) {
    return { verdict: "GO", reason: `Demand and buyer intent pass, nothing failed (${passes.length} of 4 pass).`, checks };
  }
  const open = checks.filter((c) => c.status !== "pass").map((c) => c.label.toLowerCase());
  return { verdict: "WAIT", reason: `Not yet proven: ${open.join(", ")}.`, checks };
}
