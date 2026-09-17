// lib/ai/extraction.test.ts — validator strictness + job isolation/cost log.
// Zero network: real AIRouter backed by fake providers. Run: `pnpm test`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIRouter } from "./router.ts";
import {
  buildExtractionUserText,
  runExtractionJob,
  validateExtraction,
} from "./extraction.ts";
import type { ExtractionInput } from "./extraction.ts";
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from "./types.ts";

const GOOD = {
  audience: "first-time PC builders",
  problem: "New build shows no display on first boot, builder stuck at diagnosis.",
  intent: "strong",
  urgency: "high",
  pdf_relevance: 0.9,
};

describe("validateExtraction", () => {
  it("accepts a schema-valid object", () => {
    assert.deepEqual(validateExtraction(GOOD), GOOD);
  });

  it("normalizes enum case", () => {
    const out = validateExtraction({ ...GOOD, intent: "Weak", urgency: "LOW" });
    assert.equal(out.intent, "weak");
    assert.equal(out.urgency, "low");
  });

  it("accepts numeric-string pdf_relevance", () => {
    assert.equal(validateExtraction({ ...GOOD, pdf_relevance: "0.5" }).pdf_relevance, 0.5);
  });

  it("rejects bad intent, bad urgency, out-of-range relevance, empty strings", () => {
    assert.throws(() => validateExtraction({ ...GOOD, intent: "extreme" }), /intent must be one of/);
    assert.throws(() => validateExtraction({ ...GOOD, urgency: "urgent" }), /urgency must be one of/);
    assert.throws(() => validateExtraction({ ...GOOD, pdf_relevance: 1.5 }), /pdf_relevance must be a number 0\.\.1/);
    assert.throws(() => validateExtraction({ ...GOOD, pdf_relevance: -0.1 }), /pdf_relevance must be a number/);
    assert.throws(() => validateExtraction({ ...GOOD, audience: "  " }), /audience must be/);
    assert.throws(() => validateExtraction({ ...GOOD, problem: "" }), /problem must be/);
    assert.throws(() => validateExtraction("just a string"), /must be a JSON object/);
  });
});

describe("buildExtractionUserText", () => {
  it("returns null when title and content are both empty (no grounding)", () => {
    assert.equal(
      buildExtractionUserText({ id: "x", title: null, content: "  ", url: null }),
      null,
    );
  });

  it("combines title + content", () => {
    const text = buildExtractionUserText({ id: "x", title: "T", content: "C", url: null });
    assert.ok(text?.includes("T") && text?.includes("C"));
  });
});

function cannedRouter(opts: { failOn?: (text: string) => boolean } = {}): AIRouter {
  const router = new AIRouter({} as NodeJS.ProcessEnv);
  const provider: AIProvider = {
    name: "openrouter",
    isConfigured: true,
    async chatComplete(req: ChatRequest): Promise<ChatResponse> {
      if (opts.failOn?.(req.user)) throw new Error("upstream 429 rate-limited");
      return {
        content: JSON.stringify(GOOD),
        model: "test-model",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCostUsd: 0 },
      };
    },
    async healthCheck(): Promise<ProviderHealth> {
      return { ok: true };
    },
  };
  router.register(provider);
  return router;
}

function input(id: string, title: string, content = "body text"): ExtractionInput {
  return { id, title, content, url: null };
}

describe("runExtractionJob", () => {
  it("analyzes every signal, logs cost per call", async () => {
    const job = await runExtractionJob({
      signals: [input("a", "t1"), input("b", "t2"), input("c", "t3")],
      router: cannedRouter(),
      concurrency: 2,
      interCallDelayMs: 0,
      sleepFn: async () => {},
    });
    assert.equal(job.total, 3);
    assert.equal(job.succeeded, 3);
    assert.equal(job.failed, 0);
    assert.equal(job.successes.length, 3);
    assert.deepEqual(job.successes[0].analysis, GOOD);
    assert.equal(job.costLog.length, 3);
    assert.equal(job.cost.calls, 3);
    assert.equal(job.cost.totalTokens, 450);
    assert.equal(job.cost.estimatedCostUsd, 0);
    assert.deepEqual(job.cost.models, ["test-model"]);
  });

  it("isolates failures: one bad signal does not sink the rest, no row invented", async () => {
    const job = await runExtractionJob({
      signals: [input("good1", "t1"), input("bad", "BOOM-marker"), input("good2", "t3")],
      router: cannedRouter({ failOn: (t) => t.includes("BOOM-marker") }),
      concurrency: 1,
      interCallDelayMs: 0,
      sleepFn: async () => {},
    });
    assert.equal(job.succeeded, 2);
    assert.equal(job.failed, 1);
    assert.equal(job.failures.length, 1);
    assert.equal(job.failures[0].signalId, "bad");
    assert.ok(job.failures[0].error.includes("429"));
    // successes carry only real signal ids — nothing invented
    assert.deepEqual(job.successes.map((s) => s.signalId).sort(), ["good1", "good2"]);
  });

  it("records empty-text signals as failures without calling the provider", async () => {
    let calls = 0;
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    router.register({
      name: "openrouter",
      isConfigured: true,
      async chatComplete(): Promise<ChatResponse> {
        calls++;
        return {
          content: JSON.stringify(GOOD),
          model: "m",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        };
      },
      async healthCheck(): Promise<ProviderHealth> {
        return { ok: true };
      },
    });
    const job = await runExtractionJob({
      signals: [{ id: "empty", title: null, content: null, url: null }],
      router,
      sleepFn: async () => {},
    });
    assert.equal(job.failed, 1);
    assert.equal(calls, 0);
    assert.ok(job.failures[0].error.includes("empty signal text"));
  });
});
