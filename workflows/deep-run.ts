// workflows/deep-run.ts: a Deep run as a Vercel Workflow (issue #24, DEC-001). The route that
// starts it returns the run id at once; this function carries the run to `completed` or `failed`
// whether or not the tab is open. Poll GET /api/runs/<id> for progress.
//
// Each step is its own function invocation, so no step is longer than one slice of work (a step
// may run as long as the plan's function limit, 300 s on Hobby). Step bodies import lazily: the
// workflow bundle must not pull in Node modules, only the step bundle may.

import type { DeepRunInput } from "../lib/runs/deep-steps.ts";
import { EXTRACT_SLICE } from "../lib/runs/types.ts";

async function collect(input: DeepRunInput) {
  "use step";
  const { collectDeepStep } = await import("../lib/runs/deep-steps.ts");
  return collectDeepStep(input);
}
collect.maxRetries = 1;

async function extractSlice(input: DeepRunInput, ids: string[]) {
  "use step";
  const { extractDeepStep } = await import("../lib/runs/deep-steps.ts");
  return extractDeepStep(input, ids);
}
extractSlice.maxRetries = 1;

async function finish(input: DeepRunInput, failures: number, calls: number) {
  "use step";
  const { finishDeepStep } = await import("../lib/runs/deep-steps.ts");
  return finishDeepStep(input, failures, calls);
}
finish.maxRetries = 1;


async function markFailed(runId: string, message: string) {
  "use step";
  const { markFailedStep } = await import("../lib/runs/deep-steps.ts");
  return markFailedStep(runId, message);
}
markFailed.maxRetries = 1;

export async function deepRunWorkflow(input: DeepRunInput) {
  "use workflow";
  try {
    return await runSteps(input);
  } catch (err) {
    // A throw outside a step's own catch (router setup, platform time limit): never leave the run in a running status.
    await markFailed(input.runId, `The background job crashed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

async function runSteps(input: DeepRunInput) {
  let failures = input.replyFailures ?? 0;
  let calls = 0;
  if (input.kind === "model") {
    const collected = await collect(input);
    if (!collected.ok) return { status: "failed", error: collected.error ?? null };
    for (let i = 0; i < collected.pendingIds.length; i += EXTRACT_SLICE) {
      const done = await extractSlice(input, collected.pendingIds.slice(i, i + EXTRACT_SLICE));
      if (!done.ok) return { status: "failed", error: done.error ?? null };
      failures += done.failures;
      calls += done.calls;
    }
  }
  const finished = await finish(input, failures, calls);
  return { status: finished.ok ? "completed" : "failed", error: finished.error ?? null };
}
