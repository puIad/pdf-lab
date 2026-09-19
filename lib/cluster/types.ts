// lib/cluster/types.ts — Problem clustering types (Phase 1 Part 1.4).
// Normative specs: PRD §15 (cluster shape) & docs/05-PIPELINE-SCORING.md.

import type { MarketScoreResult, TrendDirection } from "../scoring/types.ts";

export interface ClusterSignal {
  id: string;
  sourceType: string;
  title: string | null;
  content: string | null;
  url: string | null;
  publishedAt?: string | null;
  engagement?: Record<string, unknown> | null;
  analysis: {
    audience: string | null;
    problem: string | null;
    intent: string | null; // weak | medium | strong | very_strong
    urgency: string | null; // low | medium | high
    pdf_relevance: number | null; // 0..1
  };
  embedding: number[];
}

/** PRD §15 problem cluster shape. */
export interface ProblemCluster {
  id: string;
  name: string; // e.g. "Boot & Power Delivery Failures"
  frequency: number; // count of signals in this cluster
  growth: number; // growth rate / momentum metric
  audience: string; // primary audience facing this problem
  urgency: "low" | "medium" | "high";
  language: string[]; // key verbatim customer phrases & keywords
  relatedProducts: string[]; // existing or potential PDF product titles
  centroid: number[]; // cluster center vector
  signalIds: string[];
  signals: ClusterSignal[];
  scoring: MarketScoreResult;
  trend: TrendDirection;
}

export interface ClusterOptions {
  similarityThreshold?: number; // minimum cosine similarity to merge (default 0.72)
  minClusterSize?: number; // default 1
}
