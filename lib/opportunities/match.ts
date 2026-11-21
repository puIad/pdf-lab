// lib/opportunities/match.ts — which of a market's signals back one opportunity (Part 6.8).
// An opportunity cites the discussions that talk about ITS problem, not the market's first rows.

import { tokens } from "../ideas/ideas.ts";
import type { OpportunitySignalInput } from "./types.ts";

export const MAX_EVIDENCE_SIGNALS = 5;
// shortcut: both thresholds are first guesses, tune them against hand-checked runs.
/** Cosine similarity to the centroid of the candidate's own signals. */
export const MIN_EMBEDDING_MATCH = 0.8;
/** Share of the problem's content words found in a signal, used when a signal has no embedding. */
export const MIN_TOKEN_MATCH = 0.5;

export interface SignalMatch {
  /** Best matches, own signals first, at most MAX_EVIDENCE_SIGNALS. */
  signals: OpportunitySignalInput[];
  /** How many of the market's signals match this problem (QC Rule 4 count). */
  matchCount: number;
  marketTotal: number;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function centroid(vectors: number[][]): number[] {
  const out = new Array<number>(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i] / vectors.length;
  return out;
}

const signalText = (s: OpportunitySignalInput): string => `${s.analysis?.problem ?? ""} ${s.title ?? ""}`;

/**
 * Share of the problem's own content words that appear in the signal (its stored problem + title).
 * Containment, not jaccard: a long post title must not push a word-for-word problem under the bar.
 */
export function problemOverlap(problem: string, signal: OpportunitySignalInput, ignore?: Set<string>): number {
  const words = [...new Set(tokens(problem))].filter((t) => !ignore?.has(t));
  const hay = new Set(tokens(signalText(signal)));
  return words.length ? words.filter((t) => hay.has(t)).length / words.length : 0;
}

// shortcut: "more than half" and the 3-signal limit were checked on two runs only (2026-11-15),
// tune them once more completed runs have hand-checked matches.
/** Markets this small may share one evidence set (Part 6.8), so their words are all kept. */
const SMALL_MARKET = 3;

/**
 * Words found in more than half of a market's signals: the seed's words, the market's theme, and
 * the way the analyses are phrased ("they look for"). They cannot tell one problem of the market
 * from another, so the word match leaves them out (Part 6.16).
 */
export function commonWords(market: OpportunitySignalInput[]): Set<string> {
  const seen = new Map<string, number>();
  if (market.length <= SMALL_MARKET) return new Set();
  for (const s of market) for (const t of new Set(tokens(signalText(s)))) seen.set(t, (seen.get(t) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > market.length / 2).map(([t]) => t));
}

/**
 * True when extraction's problem text says the signal names none ("No specific PC problem is
 * described; ..."). Such a signal is not a problem to build a PDF on, nor evidence for one (issue #88).
 * A problem noun must precede the verb, so "No clear guide exists for ..." stays a real problem.
 */
export function isUndescribedProblem(problem: string): boolean {
  return /^\W*no\s+(?:[\w-]+\s+){0,3}(problem|fault|issue|pain|need|complaint)s?\s+(is|are|was|were)\s+(described|evidenced|stated|mentioned|identified|specified)\b(?![^.;]*\bbut\b)/i.test(problem);
}

/**
 * `own`: the signals the candidate was built from; they always match. Every other signal of the
 * market is ranked by embedding similarity to the centroid of `own`, or by token overlap with the
 * problem text when an embedding is missing.
 */
export function matchSignals(
  problem: string,
  own: OpportunitySignalInput[],
  market: OpportunitySignalInput[],
): SignalMatch {
  const ownIds = new Set(own.map((s) => s.id));
  const vectors = own.map((s) => s.embedding).filter((v): v is number[] => !!v && v.length > 0);
  const query = vectors.length > 0 && vectors.every((v) => v.length === vectors[0].length) ? centroid(vectors) : null;

  const matches: Array<{ signal: OpportunitySignalInput; rank: number }> = own.map((signal) => ({ signal, rank: 2 }));
  const common = commonWords(market);
  for (const signal of market) {
    if (ownIds.has(signal.id) || isUndescribedProblem(signal.analysis?.problem ?? "")) continue;
    if (query && signal.embedding?.length === query.length) {
      const score = cosine(query, signal.embedding);
      if (score >= MIN_EMBEDDING_MATCH) matches.push({ signal, rank: score });
    } else {
      const score = problemOverlap(problem, signal, common);
      if (score >= MIN_TOKEN_MATCH) matches.push({ signal, rank: score });
    }
  }
  matches.sort((a, b) => b.rank - a.rank);
  return {
    signals: matches.slice(0, MAX_EVIDENCE_SIGNALS).map((m) => m.signal),
    matchCount: matches.length,
    marketTotal: market.length,
  };
}
