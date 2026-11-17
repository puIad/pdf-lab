// lib/cluster/summarizer.ts — Synthesizes PRD §15 problem cluster attributes.
// Shape: name, frequency, growth, audience, urgency, language, related products.
// Uses AIRouter cheap tier when available; without it the name comes from observed problem terms.

import type { AIRouter } from "../ai/router.ts";
import type { ClusterSignal, ProblemCluster } from "./types.ts";
import { scoreMarket } from "../scoring/scoring.ts";
import { cosineSimilarity } from "./similarity.ts";
import type { TrendDirection } from "../scoring/types.ts";

export interface SummarizeClusterOptions {
  router?: AIRouter;
  tier?: "cheap";
  /** Signals clustered in the whole run; scoring turns the cluster size into a share. */
  totalSignals?: number;
  /** Called when the model call fails; the cluster keeps the name built from observed terms. */
  onModelError?: (err: unknown) => void;
  /** Give up on the model call after this long (it cannot be cancelled; its answer is ignored). */
  modelTimeoutMs?: number;
}

const URGENCY_PRIORITY: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function determineUrgency(signals: ClusterSignal[]): "low" | "medium" | "high" {
  let maxScore = 1;
  for (const s of signals) {
    const u = (s.analysis?.urgency || "low").toLowerCase();
    const score = URGENCY_PRIORITY[u] ?? 1;
    if (score > maxScore) maxScore = score;
  }
  if (maxScore === 3) return "high";
  if (maxScore === 2) return "medium";
  return "low";
}

/** Most frequent extracted audience, or null when extraction found none. */
function determineAudience(signals: ClusterSignal[]): string | null {
  const counts = new Map<string, number>();
  for (const s of signals) {
    const a = (s.analysis?.audience || "").trim();
    if (a) counts.set(a, (counts.get(a) || 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = "";
  let bestCount = -1;
  for (const [aud, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = aud;
    }
  }
  return best;
}

function extractLanguagePhrases(signals: ClusterSignal[]): string[] {
  const phrases = new Set<string>();
  for (const s of signals) {
    if (s.title) {
      const cleanTitle = s.title.replace(/[^\w\s-]/g, "").trim();
      if (cleanTitle.length > 5 && cleanTitle.length < 100) {
        phrases.add(`"${cleanTitle}"`);
      }
    }
    if (s.analysis?.problem) {
      const p = s.analysis.problem.trim();
      if (p.length > 10 && p.length < 120) {
        phrases.add(p);
      }
    }
  }
  return [...phrases].slice(0, 6);
}

/** An extraction placeholder, not a problem: "none explicitly stated in the text", "N/A". */
const PLACEHOLDER_PROBLEM = /^(n\/?a|none|unknown|nothing)\.?$|^(no|none|not)\b.*\b(stated|specified|mentioned|given|provided)\b/i;
// Words a name must not end on after it is cut short.
const TRAILING_FILLER = new Set(
  "a an the and or of to for in on with without over at by from how what which that their they".split(" "),
);
const MAX_NAME_WORDS = 12;

/**
 * A problem sentence as a market name: its first clause, without the "They need to" lead-in or a
 * leading article, at most 12 words. Null for a placeholder or an empty problem.
 */
export function problemPhraseName(problem: string | null | undefined): string | null {
  const text = problem?.trim();
  if (!text || PLACEHOLDER_PROBLEM.test(text)) return null;
  const clause = text
    .split(/[.;:](?:\s|$)|\s\(|,\s|\s[—–-]\s/)[0]
    .replace(/^(they|people|users|someone)\s+(need|needs|want|wants)\s+(to\s+)?/i, "")
    .replace(/^(they|people|users|someone)\s+((are|is|were|was)\s+)?/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
  let words = clause.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const cut = words.length > MAX_NAME_WORDS;
  if (cut) {
    words = words.slice(0, MAX_NAME_WORDS);
    while (words.length > 1 && TRAILING_FILLER.has(words[words.length - 1].toLowerCase())) words.pop();
  }
  const name = words.join(" ");
  return name[0].toUpperCase() + name.slice(1) + (cut ? "…" : "");
}

/**
 * Model-free name (#59): the problem phrase of the signal closest to the cluster's centroid, the
 * cluster's most typical member. "Unnamed cluster" when no signal has a usable problem.
 */
function generateDefaultClusterName(signals: ClusterSignal[], centroid: number[]): string {
  const ranked = signals
    .map((s) => ({ s, sim: cosineSimilarity(s.embedding, centroid) }))
    .sort((a, b) => b.sim - a.sim); // stable: equally central signals keep their order
  for (const { s } of ranked) {
    const name = problemPhraseName(s.analysis?.problem);
    if (name) return name;
  }
  return "Unnamed cluster";
}

/** The example name in the naming prompt: a model that copies it has not named anything. */
const PROMPT_EXAMPLE_NAME = "Specific Problem Family Name";

export async function summarizeCluster(
  id: string,
  signals: ClusterSignal[],
  centroid: number[],
  opts: SummarizeClusterOptions = {},
): Promise<ProblemCluster> {
  const audience = determineAudience(signals);
  const urgency = determineUrgency(signals);
  const language = extractLanguagePhrases(signals);
  const defaultName = generateDefaultClusterName(signals, centroid);
  let name = defaultName;
  // Product titles come from the model only; without one there are none to show.
  let relatedProducts: string[] = [];

  // If AIRouter is provided and cheap tier is configured, synthesize via router
  if (opts.router) {
    try {
      const signalSnippets = signals
        .slice(0, 8)
        .map((s, i) => `${i + 1}. [${s.sourceType}] ${s.title || ""} — Problem: ${s.analysis?.problem || ""}`)
        .join("\n");

      const prompt = `Synthesize a succinct name (3-6 words) and 3 PDF product ideas for this problem cluster:
${signalSnippets}

Respond with JSON:
{
  "name": "${PROMPT_EXAMPLE_NAME}",
  "products": ["Title 1 Checklist", "Title 2 Guide", "Title 3 Reference Sheet"]
}`;

      const call = opts.router.generateObject({
        tier: opts.tier || "cheap",
        system: "You are a market research clustering specialist for procedural PDF products.",
        user: prompt,
        validate: (raw: unknown) => {
          if (typeof raw !== "object" || raw === null) throw new Error("not an object");
          const r = raw as Record<string, unknown>;
          if (typeof r.name !== "string" || !r.name.trim()) throw new Error("invalid name");
          if (r.name.trim().toLowerCase() === PROMPT_EXAMPLE_NAME.toLowerCase()) throw new Error("copied the example name");
          if (!Array.isArray(r.products) || r.products.length === 0) throw new Error("invalid products");
          return {
            name: r.name.trim(),
            products: r.products.map(String).slice(0, 4),
          };
        },
        maxTokens: 300,
        temperature: 0.2,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const res = opts.modelTimeoutMs === undefined
        ? await call
        : await Promise.race([
            call,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`naming call passed ${opts.modelTimeoutMs} ms`)), opts.modelTimeoutMs);
            }),
          ]).finally(() => clearTimeout(timer));

      if (res.object.name) name = res.object.name;
      if (res.object.products.length > 0) relatedProducts = res.object.products;
    } catch (err) {
      // Provider error: keep the name built from observed problem terms
      opts.onModelError?.(err);
    }
  }

  // Trend from observed Google Trends rows only: a rising related query or a rising interest
  // summary. Trends rows without a direction read "stable"; no Trends row means unknown. The
  // orchestrator still requires 2 dated observations before storing it (QC Rule 2).
  const trendsRows = signals.filter((s) => s.sourceType === "gtrends");
  const direction = (s: ClusterSignal) => String(s.engagement?.direction ?? "").toLowerCase();
  let trend: TrendDirection = "unknown";
  if (trendsRows.some((s) => s.engagement?.rising === true || direction(s) === "rising")) trend = "accelerating";
  else if (trendsRows.some((s) => direction(s) === "falling")) trend = "declining";
  else if (trendsRows.length > 0) trend = "stable";

  // Score the market candidate
  const scoringSignals = signals.map((s) => ({
    signalId: s.id,
    sourceType: s.sourceType,
    title: s.title,
    content: s.content,
    engagement: s.engagement,
    analysis: s.analysis,
  }));

  const scoring = scoreMarket(scoringSignals, { trend, totalSignals: opts.totalSignals });

  // Growth metric: calculated based on momentum and trend
  const growth = scoring.factors.trendMomentum;

  return {
    id,
    name,
    frequency: signals.length,
    growth,
    audience,
    urgency,
    language,
    relatedProducts,
    centroid,
    signalIds: signals.map((s) => s.id),
    signals,
    scoring,
    trend,
  };
}
