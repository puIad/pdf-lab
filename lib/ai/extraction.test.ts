// lib/ai/extraction.test.ts — validator strictness + job isolation/cost log.
// Zero network: real AIRouter backed by fake providers. Run: `pnpm test`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIRouter } from "./router.ts";
import {
  buildExtractionUserText,
  runExtractionJob,
  validateBatchExtraction,
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
      batchSize: 1,
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
      batchSize: 1,
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

/** Answers a batch prompt with one item per numbered signal; `reply` can edit or drop items. */
function batchRouter(opts: { reply?: (items: Array<Record<string, unknown>>) => unknown; failBatch?: boolean; failSingle?: boolean } = {}) {
  const log = { batch: 0, single: 0 };
  const router = new AIRouter({} as NodeJS.ProcessEnv);
  router.register({
    name: "openrouter",
    isConfigured: true,
    async chatComplete(req: ChatRequest): Promise<ChatResponse> {
      const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCostUsd: 0 };
      const numbers = [...req.user.matchAll(/^\[(\d+)\]$/gm)].map((m) => Number(m[1]));
      if (numbers.length === 0) {
        log.single++;
        if (opts.failSingle) throw new Error("upstream 503");
        return { content: JSON.stringify(GOOD), model: "test-model", usage };
      }
      log.batch++;
      if (opts.failBatch) throw new Error("upstream timeout");
      const items = numbers.map((n) => ({ n, ...GOOD }));
      return { content: JSON.stringify(opts.reply ? opts.reply(items) : { items }), model: "test-model", usage };
    },
    async healthCheck(): Promise<ProviderHealth> {
      return { ok: true };
    },
  });
  return { router, log };
}

const many = (n: number) => Array.from({ length: n }, (_, i) => input(`s${i + 1}`, `title ${i + 1}`));
const quiet = { interCallDelayMs: 0, sleepFn: async () => {} };

describe("batched extraction (Part 6.9)", () => {
  it("about 100 signals use 10 calls, not 100", async () => {
    const { router, log } = batchRouter();
    const job = await runExtractionJob({ signals: many(100), router, ...quiet });
    assert.equal(job.succeeded, 100);
    assert.deepEqual(job.calls, { batch: 10, single: 0 });
    assert.deepEqual(log, { batch: 10, single: 0 });
    assert.equal(job.batchSize, 10);
    assert.equal(job.costLog.length, 10); // one cost entry per call
    assert.deepEqual(job.successes.map((s) => s.signalId), many(100).map((s) => s.id));
  });

  it("retries singly only the ids a batch left out or got wrong", async () => {
    const { router, log } = batchRouter({
      reply: (items) => ({ items: items.filter((i) => i.n !== 3).map((i) => (i.n === 7 ? { ...i, intent: "maybe" } : i)) }),
    });
    const job = await runExtractionJob({ signals: many(10), router, ...quiet });
    assert.equal(job.succeeded, 10);
    assert.deepEqual(job.calls, { batch: 1, single: 2 });
    assert.deepEqual(log, { batch: 1, single: 2 });
  });

  it("a batch call that fails as a whole is retried singly", async () => {
    const { router, log } = batchRouter({ failBatch: true });
    const job = await runExtractionJob({ signals: many(20), router, ...quiet });
    assert.equal(job.succeeded, 20);
    assert.deepEqual(job.calls, { batch: 2, single: 20 });
    assert.equal(log.single, 20);
  });

  it("a provider outage costs a few calls, not one per signal", async () => {
    const { router, log } = batchRouter({ failBatch: true, failSingle: true });
    const job = await runExtractionJob({ signals: many(100), router, ...quiet });
    assert.equal(job.succeeded, 0);
    assert.equal(job.failed, 100);
    assert.equal(log.single, 3);
    assert.ok(job.calls.batch + job.calls.single <= 15);
  });

  it("stops single retries after three failures in a row", async () => {
    const { router, log } = batchRouter({ reply: (items) => ({ items: items.slice(0, 1) }), failSingle: true });
    const job = await runExtractionJob({ signals: many(10), router, ...quiet });
    assert.equal(job.succeeded, 1);
    assert.equal(job.failed, 9);
    assert.equal(log.single, 3);
    assert.ok(job.failures.some((f) => f.error.includes("not retried")));
  });

  it("empty text never reaches the model, and batch size is configurable", async () => {
    const { router, log } = batchRouter();
    const job = await runExtractionJob({
      signals: [...many(6), { id: "empty", title: null, content: null, url: null }],
      router,
      batchSize: 3,
      ...quiet,
    });
    assert.equal(job.succeeded, 6);
    assert.equal(job.failed, 1);
    assert.equal(log.batch, 2);
    assert.equal(job.promptVersion, "extract-v2-batch");
  });

  it("validateBatchExtraction reads each item on its own", () => {
    const res = validateBatchExtraction({ items: [{ n: 1, ...GOOD }, { n: 2, ...GOOD, urgency: "soon" }, { n: 9, ...GOOD }, { n: 1, ...GOOD }] }, 3);
    assert.deepEqual(res.get(1), GOOD);
    assert.equal(typeof res.get(2), "string"); // invalid item: its error text
    assert.equal(res.has(3), false); // missing
    assert.equal(res.has(9), false); // a number outside the batch is ignored
    assert.throws(() => validateBatchExtraction({ items: [{ n: 1, intent: "x" }] }, 1), /no valid item/);
    assert.throws(() => validateBatchExtraction(GOOD, 1), /items/);
  });
});

