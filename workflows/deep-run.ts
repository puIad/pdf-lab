// workflows/deep-run.ts: a Deep run as a Vercel Workflow (issue #24, DEC-001). The route that
// starts it returns the run id at once; this function carries the run to `completed` or `failed`
// whether or not the tab is open. Poll GET /api/runs/<id> for progress.
//
// Each step is its own function invocation, so no step is longer than one slice of work (a step
// may run as long as the plan's function limit, 300 s on Hobby). Step bodies import lazily: the
// workflow bundle must not pull in Node modules, only the step bundle may.

import type { DeepRunInput } from "../lib/runs/deep-steps.ts";

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

const SLICE = 20; // = EXTRACT_SLICE in lib/runs/deep-steps.ts

export async function deepRunWorkflow(input: DeepRunInput) {
  "use workflow";

  let failures = input.replyFailures ?? 0;
  let calls = 0;
  if (input.kind === "model") {
    const collected = await collect(input);
    if (!collected.ok) return { status: "failed", error: collected.error ?? null };
    for (let i = 0; i < collected.pendingIds.length; i += SLICE) {
      const done = await extractSlice(input, collected.pendingIds.slice(i, i + SLICE));
      if (!done.ok) return { status: "failed", error: done.error ?? null };
      failures += done.failures;
      calls += done.calls;
    }
  }
  const finished = await finish(input, failures, calls);
  return { status: finished.ok ? "completed" : "failed", error: finished.error ?? null };
}
