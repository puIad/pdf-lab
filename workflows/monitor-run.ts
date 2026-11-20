// workflows/monitor-run.ts: the scheduled re-run of a watched market's seed as a Vercel Workflow
// (issue #26, DEC-001). Vercel Cron starts it (app/api/cron/monitor). "Deep-lite": collect the seed's
// sources again, extract only the signals that have no analysis yet (a re-met signal keeps its
// stored one), then build the change report against the run before. No clustering, no new markets.
// Every step is a short function invocation (Hobby limit 300 s), like workflows/deep-run.ts.

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

async function report(input: DeepRunInput, extractionError: string | null) {
  "use step";
  const { finishMonitorStep } = await import("../lib/monitor/monitor-steps.ts");
  const r = await finishMonitorStep({ runId: input.runId, seed: input.seed, startedAt: input.startedAt, extractionError });
  return { runId: r.runId, deltas: r.deltas };
}
// Not retried: a retry after a crash would find the report saved (upsert) but is not needed.
report.maxRetries = 0;

async function markFailed(input: DeepRunInput, message: string) {
  "use step";
  const { failMonitorStep } = await import("../lib/monitor/monitor-steps.ts");
  return failMonitorStep(input.runId, input.seed, message);
}
markFailed.maxRetries = 1;

export async function monitorRunWorkflow(input: DeepRunInput) {
  "use workflow";
  try {
    const collected = await collect(input);
    if (!collected.ok) throw new Error(collected.error ?? "collection failed");
    let extractionError: string | null = null;
    for (let i = 0; i < collected.pendingIds.length && !extractionError; i += EXTRACT_SLICE) {
      const done = await extractSlice(input, collected.pendingIds.slice(i, i + EXTRACT_SLICE));
      if (!done.ok) extractionError = done.error ?? "extraction failed";
    }
    return await report(input, extractionError);
  } catch (err) {
    await markFailed(input, `The monitor run crashed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
