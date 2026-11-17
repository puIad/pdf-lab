// lib/cluster/clusterer.ts — Cosine-similarity clustering for market signals.
// Normative spec: PRD §15 & Phase 1 Part 1.4.

import type { AIRouter } from "../ai/router.ts";
import type { ClusterOptions, ClusterSignal, ProblemCluster } from "./types.ts";
import { computeCentroid, cosineSimilarity } from "./similarity.ts";
import { summarizeCluster } from "./summarizer.ts";

export const DEFAULT_SIMILARITY_THRESHOLD = 0.72;
/**
 * Model naming is optional (a cluster without it keeps a name from its observed terms), so it gets
 * a budget: a call still running when it ends is abandoned, and after it, or after one failed call,
 * the remaining clusters are not sent to the model. Without it 18 clusters at 60 s each overran the
 * 5-minute clustering step (#58). 120 s of naming + one embedding call (60 s timeout) fit in 300 s.
 */
export const NAMING_BUDGET_MS = 120_000;

interface InternalCluster {
  signals: ClusterSignal[];
  centroid: number[];
}

export interface ClusterSignalsJobOptions extends ClusterOptions {
  router?: AIRouter;
  /** Overrides NAMING_BUDGET_MS (tests). */
  namingBudgetMs?: number;
  nowFn?: () => number;
}

export async function clusterSignals(
  signals: ClusterSignal[],
  opts: ClusterSignalsJobOptions = {},
): Promise<ProblemCluster[]> {
  if (signals.length === 0) return [];

  const threshold = opts.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const rawClusters: InternalCluster[] = [];

  // Pass 1: Leader / Centroid clustering
  for (const signal of signals) {
    if (!signal.embedding || signal.embedding.length === 0) continue;

    let bestClusterIdx = -1;
    let bestSim = -1;

    for (let i = 0; i < rawClusters.length; i++) {
      const sim = cosineSimilarity(signal.embedding, rawClusters[i].centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestClusterIdx = i;
      }
    }

    if (bestSim >= threshold && bestClusterIdx >= 0) {
      rawClusters[bestClusterIdx].signals.push(signal);
      rawClusters[bestClusterIdx].centroid = computeCentroid(
        rawClusters[bestClusterIdx].signals.map((s) => s.embedding),
      );
    } else {
      rawClusters.push({
        signals: [signal],
        centroid: [...signal.embedding],
      });
    }
  }

  // Pass 2: Merge adjacent clusters whose centroids exceed the threshold
  let merged = true;
  while (merged && rawClusters.length > 1) {
    merged = false;
    for (let i = 0; i < rawClusters.length; i++) {
      for (let j = i + 1; j < rawClusters.length; j++) {
        const sim = cosineSimilarity(rawClusters[i].centroid, rawClusters[j].centroid);
        if (sim >= threshold) {
          rawClusters[i].signals.push(...rawClusters[j].signals);
          rawClusters[i].centroid = computeCentroid(
            rawClusters[i].signals.map((s) => s.embedding),
          );
          rawClusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Sort clusters by frequency descending
  rawClusters.sort((a, b) => b.signals.length - a.signals.length);

  // Summarize into PRD §15 ProblemClusters
  const out: ProblemCluster[] = [];
  const now = opts.nowFn ?? Date.now;
  const namingEnds = now() + (opts.namingBudgetMs ?? NAMING_BUDGET_MS);
  let modelFailed = false;
  for (let i = 0; i < rawClusters.length; i++) {
    const cluster = rawClusters[i];
    const id = `cluster-${i + 1}`;
    const left = namingEnds - now();
    const useModel = !modelFailed && left > 0;
    const summarized = await summarizeCluster(id, cluster.signals, cluster.centroid, {
      router: useModel ? opts.router : undefined,
      tier: "cheap",
      totalSignals: rawClusters.reduce((n, c) => n + c.signals.length, 0),
      modelTimeoutMs: left,
      onModelError: (err) => {
        modelFailed = true;
        console.warn(
          `Cluster naming stopped at cluster ${i + 1} of ${rawClusters.length}; the rest keep names from observed terms: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    });
    out.push(summarized);
  }

  return out;
}
