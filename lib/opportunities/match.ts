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

// Words that carry no problem of their own: advice vocabulary (what the reader wants to receive),
// vague qualifiers, the generic nouns of a niche and the filler of an analysis sentence. A problem
// whose every content word is one of these ("needs guidance on common computer problems") names
// nothing to build a PDF on, whatever the sentence says about itself (issue #94).
const FRAME_WORDS = new Set(
  tokens(
    `user users owner owners reader readers technician technicians student students people person someone anyone
    need needs want wants look looks ask asks seek seeks require requires requiring wish wishes try tries trying
    guidance guide guides instruction instructions manual manuals schematic schematics resource resources tip tips trick tricks
    step steps tutorial tutorials documentation overview introduction introduces introduce basics technique techniques
    solution solutions fix fixes help advice checklist diy learn understand information list text covering covers cover encountered
    common typical basic simple general various everyday any some many own their its them they
    problem problems issue issues trouble troubles troubleshooting troubleshoot repair repairs diagnostic diagnostics
    pc pcs computer computers device devices desktop desktops laptop laptops hardware software operating system systems os
    restart restarting restarts start starting note noting error errors message messages say saying without perform performing
    will would should could may might also just only more most other
    `,
  ),
);

const NOUN = "(?:problem|fault|issue|pain|need|complaint)s?";
const DONE = "(?:described|evidenced|stated|mentioned|identified|specified|named|given|clear)";
// "no other issue is mentioned" is a remark about a problem already named, not an absent problem.
const FILLER = "(?!(?:other|further|additional|more|else)\\b)[\\w-]+";
// Words a request may use before "without" and still carry no symptom of its own ("Asks how to fix their PC's issues ...").
const REQUEST_WORD = "(?:how|help|advice|guidance|simple|common|general|to|for|with|about|fix|fixes|fixing|solve|solving|their|my|a|an|the|pc|pcs|pc['\\u2019]s|computer|computers|laptop|laptops|issues?|problems?)";
const END = "\\s*[.;]?\\s*$";
const SAYING = "(?:saying|stating|naming|specifying|mentioning|describing)";
const WHAT_IS = `what\\s+(?:the|their)\\s+(?:[\\w-]+\\s+)?${NOUN}\\s+(?:is|are)`;
/** Phrasings extraction uses to say a signal names no problem. Each is anchored at both ends or at a clause boundary; "but" later in the sentence means a real problem follows. */
const UNDESCRIBED_PATTERNS = [
  // "No specific PC fault is described; ..." (starts the text)
  new RegExp(`^\\W*no\\s+(?:${FILLER}\\s+){0,3}${NOUN}\\s+(?:is|are|was|were)\\s+${DONE}\\b(?![^.;]*\\bbut\\b)`, "i"),
  // "...; no specific fault is named." (the closing clause)
  new RegExp(`[.;]\\s*no\\s+(?:${FILLER}\\s+){0,3}${NOUN}\\s+(?:is|are|was|were)\\s+${DONE}${END}`, "i"),
  // "Asks how to fix their PC's issues without saying what the issue is." (a request whose words before without name no symptom)
  new RegExp(`^\\W*(?:asks|wants|seeks|looks|needs)\\b(?:\\s+${REQUEST_WORD}){0,8}\\s+without\\s+${SAYING}\\s+(?:${WHAT_IS}|(?:a|any)\\s+(?:${FILLER}\\s+)?${NOUN}\\b)${END}`, "i"),
  // "The post does not name a specific problem." (the text itself is the subject)
  new RegExp(`^\\W*(?:the\\s+)?(?:post|text|thread|comment|signal|listing|title|author|user)\\s+(?:does\\s+not|doesn['\u2019]t|did\\s+not|didn['\u2019]t)\\s+(?:say|state|name|specify|mention|describe)\\s+(?:${WHAT_IS}|(?:a|any)\\s+(?:${FILLER}\\s+)?${NOUN}\\b)${END}`, "i"),
];

/**
 * True when extraction's problem text names no concrete problem, so the signal is not a problem to
 * build a PDF on, nor evidence for one (issues #88, #94). Two independent tests, either one is enough:
 * the analysis says so itself (the anchored phrasings above), or no content word is left once advice
 * vocabulary, vague qualifiers and generic niche nouns are removed ("guidance on troubleshooting
 * common computer problems"). Dropped once, in generate25Opportunities. A problem noun must precede
 * the verb, so "No clear guide exists for ..." stays a real problem, as does anything with a symptom
 * or a named task left over ("computer will not turn on", "Windows Reset or reinstall").
 */
export function isUndescribedProblem(problem: string): boolean {
  if (UNDESCRIBED_PATTERNS.some((re) => re.test(problem))) return true;
  const words = tokens(problem).filter((t) => t.length > 1);
  return words.length > 0 && words.every((t) => FRAME_WORDS.has(t));
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
    if (ownIds.has(signal.id)) continue;
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
