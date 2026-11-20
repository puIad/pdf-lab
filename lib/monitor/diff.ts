// lib/monitor/diff.ts: change detection (Phase 4 Part 4.2). Pure: the counts and the diffs are
// computed from rows the caller loaded, so they are unit tested and reconcile to stored counts.

import { discussionsOnly } from "../runs/orchestrator.ts";
import { isListing } from "../sources/demand-only.ts";
import type { StoredSignalForRun } from "../runs/orchestrator.ts";
import type { ChangeReport, Counts, CountKey, Job, NewItem, PhraseChange, SeedSnapshot, SnapshotPhrase } from "./types.ts";

export const COUNT_KEYS: CountKey[] = ["discussions", "analysed", "buyerIntent", "complaints", "competitors"];
/** A phrase's demand must move this many points between two snapshots to count as `history`. */
export const HISTORY_MIN_MOVE = 10;
export const NEW_WINDOW_DAYS = 7;

const STRONG = new Set(["strong", "very_strong"]);

type Sig = StoredSignalForRun;
type Rule = (s: Sig) => boolean;

/** Which stored signals each count is made of. One rule per count, shared by the totals and the diff. */
const RULES: Record<CountKey, Rule> = {
  discussions: (s) => discussionsOnly([s]).length === 1,
  analysed: (s) => discussionsOnly([s]).length === 1 && !!s.analysis,
  buyerIntent: (s) => discussionsOnly([s]).length === 1 && !!s.analysis && STRONG.has(s.analysis.intent.toLowerCase()),
  complaints: (s) => discussionsOnly([s]).length === 1 && !!s.analysis?.problem?.trim(),
  // A competitor is a marketplace listing the run observed (Etsy, Gumroad, KDP).
  competitors: (s) => isListing(s),
};

const idsOf = (signals: Sig[], key: CountKey): Set<string> => new Set(signals.filter(RULES[key]).map((s) => s.id));

export function countsOf(signals: Sig[]): Counts {
  return Object.fromEntries(COUNT_KEYS.map((k) => [k, idsOf(signals, k).size])) as unknown as Counts;
}

const zero = (): Counts => ({ discussions: 0, analysed: 0, buyerIntent: 0, complaints: 0, competitors: 0 });

/**
 * The change report of a run against its baseline (PRD §44). For every count,
 * delta = added - removed, where added are the stored signals in this run's set and not the
 * baseline's, so the deltas can be checked against the stored `run_signals` rows.
 * No baseline: the report is the first reading, with no deltas.
 */
export function buildChangeReport(input: {
  seed: string;
  runId: string;
  createdAt: string;
  current: Sig[];
  baseline: { runId: string; at: string | null; signals: Sig[] } | null;
}): ChangeReport {
  const { seed, runId, createdAt, current, baseline } = input;
  const cur = countsOf(current);
  if (!baseline) {
    return { seed, runId, baselineRunId: null, createdAt, baselineAt: null, current: cur, baseline: null, deltas: null, added: null, removed: null, newItems: [], unanalysedNew: 0, note: "First reading of this seed: there is no earlier run to compare with." };
  }
  const added = zero();
  const removed = zero();
  const deltas = zero();
  for (const k of COUNT_KEYS) {
    const a = idsOf(current, k);
    const b = idsOf(baseline.signals, k);
    added[k] = [...a].filter((id) => !b.has(id)).length;
    removed[k] = [...b].filter((id) => !a.has(id)).length;
    deltas[k] = a.size - b.size;
  }
  const before = new Set(baseline.signals.map((s) => s.id));
  const fresh = current.filter((s) => !before.has(s.id));
  const newItems: NewItem[] = [];
  for (const s of fresh) {
    const kind: NewItem["kind"] | null = RULES.competitors(s) ? "product" : RULES.complaints(s) ? "complaint" : RULES.discussions(s) ? "discussion" : null;
    if (kind) newItems.push({ kind, title: s.title, url: s.url });
  }
  const unanalysedNew = fresh.filter((s) => RULES.discussions(s) && !s.analysis).length;
  return {
    seed,
    runId,
    baselineRunId: baseline.runId,
    createdAt,
    baselineAt: baseline.at,
    current: cur,
    baseline: countsOf(baseline.signals),
    deltas,
    added,
    removed,
    newItems: newItems.slice(0, 30),
    unanalysedNew,
    note: unanalysedNew > 0 ? `${unanalysedNew} new discussion${unanalysedNew === 1 ? " is" : "s are"} not analysed, so their buyer intent and problems are not observed.` : null,
  };
}

/** True when the delta of every count equals added minus removed (the report's own invariant). */
export function reconciles(r: ChangeReport): boolean {
  if (!r.deltas || !r.added || !r.removed || !r.baseline) return true;
  return COUNT_KEYS.every((k) => r.deltas![k] === r.added![k] - r.removed![k] && r.deltas![k] === r.current[k] - r.baseline![k]);
}

// ---- seed snapshots (DEC-010): the `new` and `history` trend bases -------------------------------

export const normalizeSeed = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What changed in `current` against the snapshots before it (oldest first).
 * `new`: the phrase was in no earlier snapshot. `history`: it was in the latest earlier one and its
 * demand moved by HISTORY_MIN_MOVE or more. The first snapshot of a seed has nothing before it, so
 * nothing in it is called new.
 */
export function diffSnapshots(earlier: SeedSnapshot[], current: SeedSnapshot): PhraseChange[] {
  if (earlier.length === 0) return [];
  const known = new Set(earlier.flatMap((s) => s.phrases.map((p) => p.phrase)));
  const last = earlier[earlier.length - 1];
  const lastBy = new Map(last.phrases.map((p) => [p.phrase, p]));
  const changes: PhraseChange[] = [];
  for (const p of current.phrases) {
    if (!known.has(p.phrase)) {
      changes.push({ basis: "new", phrase: p.phrase, firstSeen: current.scannedAt, previousScan: last.scannedAt, demand: p.demand });
      continue;
    }
    const before = lastBy.get(p.phrase);
    if (before && Math.abs(p.demand - before.demand) >= HISTORY_MIN_MOVE) {
      changes.push({ basis: "history", phrase: p.phrase, from: { at: last.scannedAt, demand: before.demand }, to: { at: current.scannedAt, demand: p.demand } });
    }
  }
  return changes;
}

/** Phrases whose first appearance is in a snapshot of the last 7 days that is not the seed's first. Dated. */
export function newThisWeek(snapshots: SeedSnapshot[], now: Date = new Date()): { count: number; since: string; phrases: Array<{ phrase: string; firstSeen: string }> } {
  const since = new Date(now.getTime() - NEW_WINDOW_DAYS * 86_400_000).toISOString();
  const first = new Map<string, string>();
  snapshots.forEach((s, i) => {
    for (const p of s.phrases) if (i > 0 && !snapshots.slice(0, i).some((e) => e.phrases.some((q) => q.phrase === p.phrase)) && !first.has(p.phrase)) first.set(p.phrase, s.scannedAt);
  });
  const phrases = [...first].filter(([, at]) => at >= since).map(([phrase, firstSeen]) => ({ phrase, firstSeen }));
  return { count: phrases.length, since, phrases };
}

export const toSnapshotPhrases = (ideas: Array<{ phrase: string; demand: number; opportunity: number; trend: string | null }>): SnapshotPhrase[] =>
  ideas.map(({ phrase, demand, opportunity, trend }) => ({ phrase, demand, opportunity, trend }));

// ---- scheduling and missed-run backoff -------------------------------------------------------------

const HOUR = 3_600_000;
/** A job that ran fine is due again after 20 h: a daily cron (Hobby fires once a day, up to 59 min late) never skips or doubles it. */
export const OK_INTERVAL_H = 20;
export const MAX_BACKOFF_DAYS = 7;

export const seedJobKey = (seed: string, region: string) => `seed|${region}|${normalizeSeed(seed)}`;
export const marketJobKey = (seed: string) => `market|${normalizeSeed(seed)}`;

export function isDue(job: Job | null, now: Date, force = false): boolean {
  return force || !job?.nextDueAt || new Date(job.nextDueAt) <= now;
}

/**
 * Job state after a run. A success resets the failures. The first failure retries at the next
 * daily cron; later ones back off 2, 4, then 7 days at most, so a broken seed does not spend a
 * scan a day. A missed cron is not a failure: the job is simply still due, and one run covers the gap.
 */
export function afterRun(job: Job | null, key: string, now: Date, error: string | null): Job {
  if (!error) return { key, lastOkAt: now.toISOString(), failures: 0, nextDueAt: new Date(now.getTime() + OK_INTERVAL_H * HOUR).toISOString(), lastError: null };
  const failures = (job?.failures ?? 0) + 1;
  const hours = failures <= 1 ? OK_INTERVAL_H : Math.min(2 ** (failures - 1), MAX_BACKOFF_DAYS) * 24 - 4;
  return { key, lastOkAt: job?.lastOkAt ?? null, failures, nextDueAt: new Date(now.getTime() + hours * HOUR).toISOString(), lastError: error.slice(0, 300) };
}
