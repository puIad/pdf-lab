// lib/runs/work.ts: what a run cost to produce, kept in `research_runs.plan.work` (issue #72).
// Needs no migration and does not depend on the usage ledger table.

import type { RunWork } from "./types.ts";

export const EMPTY_WORK: RunWork = { adapterCalls: 0, extractionCalls: 0, tokens: null, activeMs: 0, listingsDropped: 0 };

/** Adds a patch to stored figures: durations and drops accumulate, everything else is replaced. */
export function mergeWork(prev: Partial<RunWork> | null | undefined, patch: Partial<RunWork>): RunWork {
  const base = { ...EMPTY_WORK, ...(prev ?? {}) };
  return {
    ...base,
    ...patch,
    activeMs: base.activeMs + (patch.activeMs ?? 0),
    listingsDropped: base.listingsDropped + (patch.listingsDropped ?? 0),
  };
}

/** The stored `plan` column's work figures, or null when the run recorded none. */
export function workOfPlan(plan: unknown): RunWork | null {
  const w = (plan as { work?: Partial<RunWork> } | null)?.work;
  return w && typeof w === "object" ? { ...EMPTY_WORK, ...w } : null;
}

/** One line for the run summary. A figure never observed says so. */
export function describeWork(w: RunWork): string {
  const secs = (w.activeMs / 1000).toFixed(1);
  const tokens = w.tokens === null ? "tokens not observed (analysis by the pasted reply's own model)" : `${w.tokens.toLocaleString("en-US")} tokens`;
  return `${w.adapterCalls} adapter ${w.adapterCalls === 1 ? "call" : "calls"}, ${w.extractionCalls} extraction model ${w.extractionCalls === 1 ? "call" : "calls"}, ${tokens}, ${secs} s of work`;
}
