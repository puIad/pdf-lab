// lib/cluster/summarizer.ts — Synthesizes PRD §15 problem cluster attributes.
// Shape: name, frequency, growth, audience, urgency, language, related products.
// Uses AIRouter cheap tier when available; without it the name comes from observed problem terms.

import type { AIRouter } from "../ai/router.ts";
import type { ClusterSignal, ProblemCluster } from "./types.ts";
import { scoreMarket } from "../scoring/scoring.ts";
import type { TrendDirection } from "../scoring/types.ts";

export interface SummarizeClusterOptions {
  router?: AIRouter;
  tier?: "cheap";
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

const NAME_STOP = new Set(
  "a an the and or of to for in on with how what why when is are was can do does did my your you i me we they it its be as at by from this that not no have has had get got but if so than then there their them too very just about into out up will would could should".split(" "),
);

/** Model-free name: the cluster's most frequent problem terms (titles when no problem was extracted). */
function generateDefaultClusterName(signals: ClusterSignal[]): string {
  const problems = signals.map((s) => s.analysis?.problem || "").filter(Boolean);
  const texts = problems.length > 0 ? problems : signals.map((s) => s.title || "");
  const counts = new Map<string, number>();
  for (const text of texts) {
    // Count each term once per signal so one long text cannot name the cluster.
    for (const term of new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !NAME_STOP.has(t)))) {
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t]) => t);
  return top.length > 0 ? top.map((t) => t[0].toUpperCase() + t.slice(1)).join(" ") : "Unnamed cluster";
}

export async function summarizeCluster(
  id: string,
  signals: ClusterSignal[],
  centroid: number[],
  opts: SummarizeClusterOptions = {},
): Promise<ProblemCluster> {
  const audience = determineAudience(signals);
  const urgency = determineUrgency(signals);
  const language = extractLanguagePhrases(signals);
  const defaultName = generateDefaultClusterName(signals);
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
  "name": "Specific Problem Family Name",
  "products": ["Title 1 Checklist", "Title 2 Guide", "Title 3 Reference Sheet"]
}`;

      const res = await opts.router.generateObject({
        tier: opts.tier || "cheap",
        system: "You are a market research clustering specialist for procedural PDF products.",
        user: prompt,
        validate: (raw: unknown) => {
          if (typeof raw !== "object" || raw === null) throw new Error("not an object");
          const r = raw as Record<string, unknown>;
          if (typeof r.name !== "string" || !r.name.trim()) throw new Error("invalid name");
          if (!Array.isArray(r.products) || r.products.length === 0) throw new Error("invalid products");
          return {
            name: r.name.trim(),
            products: r.products.map(String).slice(0, 4),
          };
        },
        maxTokens: 300,
        temperature: 0.2,
      });

      if (res.object.name) name = res.object.name;
      if (res.object.products.length > 0) relatedProducts = res.object.products;
    } catch {
      // Provider error: keep the name built from observed problem terms
    }
  }

  // Determine trend: if any signal has rising/accelerating, mark emerging/accelerating
  let trend: TrendDirection = "stable";
  const anyGtrends = signals.some((s) => s.sourceType === "gtrends");
  if (anyGtrends) {
    trend = "accelerating";
  }

  // Score the market candidate
  const scoringSignals = signals.map((s) => ({
    signalId: s.id,
    sourceType: s.sourceType,
    title: s.title,
    content: s.content,
    engagement: s.engagement,
    analysis: s.analysis,
  }));

  const scoring = scoreMarket(scoringSignals, { trend });

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
