// lib/opportunities/match.ts — which of a market's signals back one opportunity (Part 6.8).
// An opportunity cites the discussions that talk about ITS problem, not the market's first rows.

import { jaccard, tokens } from "../ideas/ideas.ts";
import type { OpportunitySignalInput } from "./types.ts";

export const MAX_EVIDENCE_SIGNALS = 5;
// shortcut: both thresholds are first guesses, tune them against hand-checked runs.
/** Cosine similarity to the centroid of the candidate's own signals. */
export const MIN_EMBEDDING_MATCH = 0.8;
/** Share of content words in common, used when a signal has no embedding. */
export const MIN_TOKEN_MATCH = 0.2;

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

/** Token overlap between a problem statement and one signal. */
export function problemOverlap(problem: string, signal: OpportunitySignalInput): number {
  return jaccard(tokens(problem), tokens(signalText(signal)));
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
  for (const signal of market) {
    if (ownIds.has(signal.id)) continue;
    if (query && signal.embedding?.length === query.length) {
      const score = cosine(query, signal.embedding);
      if (score >= MIN_EMBEDDING_MATCH) matches.push({ signal, rank: score });
    } else {
      const score = problemOverlap(problem, signal);
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
