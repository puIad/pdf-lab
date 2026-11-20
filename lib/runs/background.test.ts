// lib/runs/background.test.ts: the pieces of a background Deep run (issue #24): collect, extract in
// slices from stored state, and a timed-out step that stops before it writes.
// Run: `pnpm test` (node:test, no network, no DB).

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { collectRunStep, extractRunStep, markRunFailed, stepTimeoutMs } from "./orchestrator.ts";
import type { OrchestratorDeps, RunFrame, StoredSignalForRun } from "./orchestrator.ts";

const frame: RunFrame = { runId: "run-1", query: "budgeting", mode: "deep", startedAt: "2026-11-20T00:00:00Z", seed: "budgeting" };
const sig = (id: string, analysed = false): StoredSignalForRun => ({
  id,
  title: id,
  content: "text",
  url: null,
  source_id: "src",
  source_type: "reddit",
  analysis: analysed ? { id: `a-${id}`, audience: "a", problem: "p", intent: "strong", urgency: "high", pdf_relevance: 0.5, embedding: null } : null,
});

function deps(over: Partial<OrchestratorDeps>, log: { statuses: string[]; errors: string[]; writes: number[] }): OrchestratorDeps {
  return {
    updateRunStatus: async (_id, status) => void log.statuses.push(status),
    recordRunError: async (_id, message) => void log.errors.push(message),
    ingest: async () => ({ collected: 3, normalized: 3, inserted: 3, sources: [{ key: "reddit", status: "ok", count: 3 }] }),
    getSignals: async () => [sig("a"), sig("b", true), sig("c")],
    extract: async (signals) => ({ analyzed: signals.length, succeeded: signals.length, failed: 0, calls: 1 }),
    fetchCompleteness: async () => ({
      sourcesCovered: 0, signalsCollected: 0, signalsAnalyzed: 0, marketsIdentified: 0,
      opportunitiesGenerated: 0, evidenceCount: 0, evidenceBackedOpportunitiesCount: 0, completenessPercentage: 0,
    }),
    ...over,
  } as OrchestratorDeps;
}

afterEach(() => {
  delete process.env.DEEP_STEP_TIMEOUT_MS;
});

describe("background Deep run steps", () => {
  it("collect lists only the signals that still need an analysis", async () => {
    const log = { statuses: [] as string[], errors: [] as string[], writes: [] as number[] };
    const res = await collectRunStep(frame, { query: "budgeting" }, deps({}, log));
    assert.equal(res.failed, null);
    assert.deepEqual(res.pendingIds, ["a", "c"]);
    assert.deepEqual(log.statuses, ["collecting", "normalizing", "classifying"]);
  });

  it("extract reads its inputs from the store and skips ids that are analysed already", async () => {
    const log = { statuses: [] as string[], errors: [] as string[], writes: [] as number[] };
    const seen: string[][] = [];
    const d = deps({ extract: async (signals) => (seen.push(signals.map((s) => s.id)), { analyzed: signals.length, succeeded: signals.length, failed: 0, calls: 1 }) }, log);
    const res = await extractRunStep(frame, d, ["a", "b"]);
    assert.equal(res.failed, null);
    assert.deepEqual(seen, [["a"]]); // "b" has an analysis: not sent again
    assert.equal(res.calls, 1);
  });

  it("a timed-out step fails the run, records why, and aborts the work so it writes nothing after", async () => {
    process.env.DEEP_STEP_TIMEOUT_MS = "30";
    assert.equal(stepTimeoutMs(), 30);
    const log = { statuses: [] as string[], errors: [] as string[], writes: [] as number[] };
    let failedAt = 0;
    const d = deps(
      {
        updateRunStatus: async (_id, status) => {
          log.statuses.push(status);
          if (status === "failed") failedAt = Date.now();
        },
        extract: async (signals, signal) => {
          await new Promise((r) => setTimeout(r, 80)); // the model call outlives the timeout
          if (!signal?.aborted) log.writes.push(Date.now()); // what the real dep does before its upsert
          return { analyzed: signals.length, succeeded: signals.length, failed: 0 };
        },
      },
      log,
    );
    const res = await extractRunStep(frame, d, ["a"]);
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(res.failed);
    assert.match(res.failed.error ?? "", /extract timed out after \d+ms/);
    assert.equal(log.statuses.at(-1), "failed");
    assert.match(log.errors[0], /timed out/);
    assert.ok(failedAt > 0);
    assert.deepEqual(log.writes, []); // nothing written after the failure
  });
});

describe("markRunFailed", () => {
  it("sets the failed status and records the reason, so a crashed workflow never leaves a running run", async () => {
    const log = { statuses: [] as string[], errors: [] as string[], writes: [] as number[] };
    await markRunFailed(deps({}, log), "run-1", "The background job crashed: boom");
    assert.deepEqual(log.statuses, ["failed"]);
    assert.deepEqual(log.errors, ["The background job crashed: boom"]);
  });

  it("the default step timeout stays under Hobby's 300 s function limit", () => {
    assert.ok(stepTimeoutMs() < 300_000);
  });
});
