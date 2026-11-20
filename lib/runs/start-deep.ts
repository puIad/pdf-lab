// lib/runs/start-deep.ts: starts the background workflow of a Deep run (issue #24). Server-only.
// The caller gets the run id as soon as the run row exists; the workflow does the rest.

import { start } from "workflow/api";
import { deepRunWorkflow } from "../../workflows/deep-run.ts";
import { createRunFrame, markRunFailed, type ResearchRunOptions } from "./orchestrator.ts";
import { createServerOrchestratorDeps } from "./service-deps.ts";
import type { DeepRunInput } from "./deep-steps.ts";

type Common = Omit<DeepRunInput, "kind" | "mode" | "limit" | "sourceKeys">;

/** Marks a run failed when its workflow could not be started, so it never sits in `queued` forever. */
async function failStart(runId: string, err: unknown): Promise<never> {
  const message = `The background job could not be started: ${err instanceof Error ? err.message : String(err)}`;
  await markRunFailed(createServerOrchestratorDeps(), runId, message);
  throw new Error(message);
}

/** A Deep run that analyses through the router: create the row, start the workflow, return the id. */
export async function startModelRun(options: ResearchRunOptions): Promise<{ runId: string }> {
  const frame = await createRunFrame(options, createServerOrchestratorDeps());
  const input: DeepRunInput = {
    runId: frame.runId,
    query: frame.query,
    seed: frame.seed,
    mode: frame.mode,
    startedAt: frame.startedAt,
    limit: options.limit ?? 25,
    sourceKeys: options.sourceKeys,
    userId: options.userId ?? null,
    kind: "model",
  };
  try {
    await start(deepRunWorkflow, [input]);
  } catch (err) {
    await failStart(frame.runId, err);
  }
  return { runId: frame.runId };
}

/** The tail of a pasted run: its analyses are stored, the workflow clusters, scores and reports. */
export async function startFinishRun(input: Common & { mode: string; marketLabels: Array<[string, string]> }): Promise<void> {
  try {
    await start(deepRunWorkflow, [{ ...input, limit: 0, kind: "finish" } satisfies DeepRunInput]);
  } catch (err) {
    await failStart(input.runId, err);
  }
}
