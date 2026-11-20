// lib/runs/deep-steps.ts: the pieces of a background Deep run (issue #24, DEC-001), one function per
// workflow step. Server-only. Each one rebuilds its dependencies and reads its inputs from the
// database, so a step that runs again on another invocation needs nothing from the one before it.

import { routerForUser } from "../keys/server.ts";
import { collectRunStep, markRunFailed, extractRunStep, finishPastedRun, type RunFrame } from "./orchestrator.ts";
import { createServerOrchestratorDeps } from "./service-deps.ts";

/** What the workflow carries between steps: plain JSON, stored in the workflow's event log. */
export interface DeepRunInput {
  runId: string;
  query: string;
  seed: string;
  mode: string;
  startedAt: string;
  limit: number;
  sourceKeys?: string[];
  userId: string | null;
  /** "model": collect, extract through the router, finish. "finish": the analyses are stored already (a pasted reply). */
  kind: "model" | "finish";
  /** Pasted run: signal id to the market name the reply gave it. */
  marketLabels?: Array<[string, string]>;
  /** Pasted run: items of the reply that were wrong or missing. */
  replyFailures?: number;
}

export interface StepResult {
  ok: boolean;
  error?: string | null;
}

const frameOf = (i: DeepRunInput): RunFrame => ({ runId: i.runId, query: i.query, mode: i.mode, startedAt: i.startedAt, seed: i.seed });

async function depsOf(i: DeepRunInput) {
  const userRouter = await routerForUser(i.userId);
  userRouter.context.runId = i.runId; // the run's model calls are filed under it
  return createServerOrchestratorDeps({
    userRouter,
    marketLabels: i.marketLabels ? new Map(i.marketLabels) : undefined,
  });
}

/** The workflow crashed outside a step's own catch: mark the run failed so the page stops polling. */
export async function markFailedStep(runId: string, message: string): Promise<void> {
  await markRunFailed(createServerOrchestratorDeps(), runId, message);
}

export async function collectDeepStep(i: DeepRunInput): Promise<StepResult & { pendingIds: string[] }> {
  const options = { query: i.query, seed: i.seed, mode: "deep" as const, limit: i.limit, sourceKeys: i.sourceKeys, userId: i.userId };
  const res = await collectRunStep(frameOf(i), options, await depsOf(i));
  return { ok: !res.failed, error: res.failed?.error ?? null, pendingIds: res.pendingIds };
}

export async function extractDeepStep(i: DeepRunInput, ids: string[]): Promise<StepResult & { failures: number; calls: number }> {
  const res = await extractRunStep(frameOf(i), await depsOf(i), ids);
  return { ok: !res.failed, error: res.failed?.error ?? null, failures: res.failures, calls: res.calls };
}

export async function finishDeepStep(i: DeepRunInput, failures: number, calls: number): Promise<StepResult> {
  const summary = await finishPastedRun(frameOf(i), await depsOf(i), failures, calls);
  return { ok: summary.status === "completed", error: summary.error ?? null };
}
