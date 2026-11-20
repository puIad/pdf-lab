// lib/runs/types.ts — Normative research run lifecycle types per docs/PIPELINE-SCORING.md & PRD §38, §55.

export const LIFECYCLE_STATES = [
  "queued",
  "collecting",
  "normalizing",
  "classifying",
  "clustering",
  "trend_analysis",
  "competition_analysis",
  "opportunity_generation",
  "report_generation",
  "completed",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number] | "failed";

export interface LifecycleTraceStep {
  state: LifecycleState;
  timestamp: string;
  durationMs?: number;
  counts?: Record<string, number>;
  message?: string;
}

export interface ResearchCompleteness {
  sourcesCovered: number;
  signalsCollected: number;
  signalsAnalyzed: number;
  marketsIdentified: number;
  opportunitiesGenerated: number;
  evidenceCount: number;
  evidenceBackedOpportunitiesCount: number;
  completenessPercentage: number;
  /** Analysed signals that are in none of the run's markets (no embedding, or unrelated to the topic). */
  signalsNotClustered?: number;
  /** One market only: QC rules that had rows to check, and how many of them held. */
  qcRulesChecked?: number;
  qcRulesHeld?: number;
}

export interface ResearchRunRecord {
  id: string;
  user_id: string | null;
  query: string;
  mode: string;
  status: LifecycleState;
  started_at: string;
  completed_at: string | null;
}

/**
 * What one run cost to produce, read from the run itself (issue #72). `tokens` is null when no
 * model call of ours was metered: a pasted Deep run is analysed by the user's own model call.
 */
export interface RunWork {
  /** Marketplace and discussion adapters queried. */
  adapterCalls: number;
  /** Model calls PDF Lab made for extraction (0 for a pasted run). */
  extractionCalls: number;
  /** Tokens of the run's metered model calls; null = none metered. */
  tokens: number | null;
  /** Time PDF Lab worked on the run, in ms; the wait for a pasted reply is not in it. */
  activeMs: number;
  /** Listings collected but dropped as off topic. */
  listingsDropped: number;
}

export interface RunSummary {
  runId: string;
  query: string;
  mode: string;
  status: LifecycleState;
  startedAt: string;
  completedAt: string | null;
  error?: string | null;
  trace: LifecycleTraceStep[];
  completeness: ResearchCompleteness;
  /** Present on a completed run. */
  work?: RunWork;
  counts: {
    sources: number;
    signalsCollected: number;
    signalsAnalyzed: number;
    marketsCreated: number;
    opportunitiesCreated: number;
    evidenceCount: number;
  };
}

export interface RunDetailResponse {
  run: ResearchRunRecord;
  lifecycle: {
    currentState: LifecycleState;
    trace: LifecycleTraceStep[];
  };
  completeness: ResearchCompleteness;
  error?: string | null;
}
