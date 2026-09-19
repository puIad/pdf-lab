// lib/runs/types.ts — Normative research run lifecycle types per docs/05-PIPELINE-SCORING.md & PRD §38, §55.

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
