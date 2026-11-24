// lib/runs/pasted.test.ts — Part 6.15: Deep runs analysed by a pasted model reply.
// Run: `pnpm test` (node:test, zero network, zero DB).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPastePrompt, groupByMarket, marketKey, NO_MARKET, parsePastedReply, promptSignals } from "./pasted.ts";
import {
  executeResearchRun,
  finishPastedRun,
  startPastedRun,
  type OrchestratorDeps,
  type StoredSignalForRun,
} from "./orchestrator.ts";

const item = (n: number, market: string, extra: Record<string, unknown> = {}) => ({
  n,
  audience: "households",
  problem: `problem ${n}`,
  intent: "strong",
  urgency: "medium",
  pdf_relevance: 0.7,
  market,
  ...extra,
});

describe("prompt for the chat model", () => {
  const signals = [
    { id: "b", title: "Second by id", content: "body b" },
    { id: "a", title: "First by id", content: null },
    { id: "c", title: null, content: "   " },
  ];

  it("numbers signals in a fixed order and leaves out empty ones", () => {
    const ordered = promptSignals(signals);
    assert.deepEqual(ordered.map((s) => s.id), ["a", "b"]);
    assert.deepEqual(promptSignals([...signals].reverse()).map((s) => s.id), ["a", "b"]); // input order does not matter
    const prompt = buildPastePrompt("budgeting", ordered);
    assert.match(prompt, /Below are 2 signals/);
    assert.ok(prompt.indexOf("[1]\nFirst by id") < prompt.indexOf("[2]\nSecond by id\nbody b"));
    assert.match(prompt, /"market"/);
    assert.match(prompt, /use exactly "none"/);
    assert.match(prompt, /\{"items": \[\.\.\.\]\}/);
  });

  it("shows the model only stored text, capped per signal", () => {
    const prompt = buildPastePrompt("budgeting", promptSignals([{ id: "a", title: "T", content: "x".repeat(5000) }]));
    assert.ok(prompt.length < 4000);
    assert.doesNotMatch(prompt, /https?:\/\//); // no urls, ids or scores leak into the prompt
  });
});

describe("parsePastedReply", () => {
  it("reads a reply wrapped in a code block with prose around it", () => {
    const text = `Here is the analysis:\n\n\`\`\`json\n${JSON.stringify({ items: [item(1, "Debt payoff"), item(2, "Grocery costs")] })}\n\`\`\`\nLet me know if you need more.`;
    const res = parsePastedReply(text, 2);
    assert.equal(res.items.size, 2);
    assert.equal(res.items.get(1)?.market, "Debt payoff");
    assert.deepEqual(res.problems, []);
    assert.deepEqual(res.missing, []);
  });

  it("lists wrong and missing items instead of guessing them", () => {
    const res = parsePastedReply(
      JSON.stringify({
        items: [
          item(1, "Debt payoff"),
          item(2, "Debt payoff", { intent: "maybe" }), // bad enum
          item(3, ""), // no market
          item(9, "Outside the prompt"), // ignored
          item(1, "Duplicate number"), // first wins
        ],
      }),
      5,
    );
    assert.deepEqual([...res.items.keys()], [1]);
    assert.deepEqual(res.problems.map((p) => p.n), [2, 3]);
    assert.match(res.problems[0].reason, /intent/);
    assert.match(res.problems[1].reason, /market/);
    assert.deepEqual(res.missing, [4, 5]);
  });

  it("accepts a bare array and trims the market name", () => {
    const res = parsePastedReply(JSON.stringify([item(1, "  Debt   payoff ")]), 1);
    assert.equal(res.items.get(1)?.market, "Debt payoff");
  });

  it("rejects text that is not a batch at all", () => {
    assert.throws(() => parsePastedReply("Sure! I analysed your signals.", 3), /not JSON/);
    assert.throws(() => parsePastedReply('{"result": "ok"}', 3), /no "items" array/);
  });
});

describe("groupByMarket", () => {
  it("reads \"none\" the same way for grouping and for the page's count", () => {
    for (const name of ["none", "None.", "(none)", " NONE "]) assert.equal(marketKey(name), NO_MARKET);
    assert.deepEqual(groupByMarket([{ id: "s1" }], new Map([["s1", "(None.)"]])), []);
  });

  it("groups by the model's name, ignoring case and punctuation, largest first", () => {
    const signals = ["s1", "s2", "s3", "s4"].map((id) => ({ id }));
    const groups = groupByMarket(
      signals,
      new Map([
        ["s1", "Debt payoff"],
        ["s2", "Grocery costs"],
        ["s3", "debt-payoff"],
        ["s4", "none"],
      ]),
    );
    assert.deepEqual(groups.map((g) => [g.name, g.signals.map((s) => s.id)]), [
      ["Debt payoff", ["s1", "s3"]],
      ["Grocery costs", ["s2"]],
    ]); // s4 is marked "none": unrelated to the topic, in no market
    assert.deepEqual(groupByMarket(signals, new Map([["s1", "None"]])), []);
    assert.deepEqual(groupByMarket(signals, new Map()), []); // no name: not analysed
  });
});

describe("a run in two requests", () => {
  const sig = (id: string, analysed: boolean): StoredSignalForRun => ({
    id,
    title: `title ${id}`,
    content: `content ${id}`,
    url: `https://reddit.com/${id}`,
    source_id: "src-reddit",
    source_type: "reddit",
    published_at: "2026-11-01T00:00:00Z",
    analysis: analysed
      ? { id: `a-${id}`, audience: "households", problem: `problem ${id}`, intent: "strong", urgency: "high", pdf_relevance: 0.8, embedding: null }
      : null,
  });

  function deps(state: { analysed: boolean; extractCalls: number; status: string[] }): OrchestratorDeps {
    const signals = () => [sig("s1", state.analysed), sig("s2", state.analysed), { ...sig("e1", false), source_type: "etsy" }];
    return {
      createRun: async () => ({ id: "run-1", started_at: "2026-11-14T00:00:00Z" }),
      updateRunStatus: async (_id, status) => {
        state.status.push(status);
      },
      ingest: async () => ({ collected: 3, normalized: 3, inserted: 3, sources: [{ key: "reddit", status: "ok", count: 2 }] }),
      getSignals: async () => signals(),
      extract: async (rows) => {
        state.extractCalls++;
        return { analyzed: rows.length, succeeded: 0, failed: rows.length };
      },
      clusterAndScore: async (all) => [
        { id: "c1", name: "Debt payoff", trend: "unknown", demandScore: 50, confidence: 0.5, pdfFitScore: 70, signals: all.filter((s) => s.analysis) },
      ],
      saveMarkets: async (markets) => markets.map((m, i) => ({ id: `market-${i + 1}`, name: m.name })),
      saveEvidence: async (items) =>
        items.map((e, i) => ({
          id: `ev-${i}`, entity_type: e.entityType, entity_id: e.entityId, source_id: e.sourceId ?? null,
          claim: e.claim, excerpt: e.excerpt ?? null, url: e.url ?? null, created_at: "2026-11-14T00:00:00Z",
        })),
      generateOpportunities: async (markets) => [
        {
          opportunity: {
            id: "opp-1", marketId: markets[0].id, title: "Debt payoff planner", targetAudience: "households",
            problem: "problem s1", solution: "planner", format: "planner", opportunityScore: 60, confidence: 0.5,
            matchingSignals: 2, marketSignals: 2,
          },
          evidence: [{ entityType: "opportunity", entityId: "opp-1", sourceId: "src-reddit", claim: "c", excerpt: "e", url: "u" }],
        },
      ],
      saveOpportunities: async (items) => items.map((i) => ({ id: i.id, title: i.title })),
      observeCompetition: async () => [],
      fetchCompleteness: async () => ({
        sourcesCovered: 1, signalsCollected: 2, signalsAnalyzed: 2, marketsIdentified: 1, opportunitiesGenerated: 1,
        evidenceCount: 3, evidenceBackedOpportunitiesCount: 1, completenessPercentage: 80,
      }),
    };
  }

  it("the first request collects and stops in classifying, without calling a model", async () => {
    const state = { analysed: false, extractCalls: 0, status: [] as string[] };
    const paused = await startPastedRun({ query: "budgeting" }, deps(state));
    assert.equal(paused.status, "awaiting_reply");
    if (paused.status !== "awaiting_reply") return;
    assert.equal(state.extractCalls, 0);
    assert.deepEqual(state.status, ["collecting", "normalizing", "classifying"]);
    assert.deepEqual(paused.signals.map((s) => s.id), ["s1", "s2"]); // the listing is not a discussion
    assert.equal(paused.frame.seed, "budgeting");
  });

  it("the second request finishes from the stored analyses", async () => {
    const state = { analysed: true, extractCalls: 0, status: [] as string[] };
    const summary = await finishPastedRun(
      { runId: "run-1", query: "budgeting", mode: "deep", startedAt: "2026-11-14T00:00:00Z", seed: "budgeting" },
      deps(state),
      0,
    );
    assert.equal(summary.status, "completed", summary.error ?? "");
    assert.equal(state.extractCalls, 0);
    assert.equal(state.status.at(-1), "completed");
    assert.equal(summary.trace[0].state, "classifying");
    assert.equal(summary.trace.find((t) => t.state === "clustering")?.counts?.extractionCalls, 0);
  });

  it("finishing before any analysis is stored fails the run, as in a model run", async () => {
    const state = { analysed: false, extractCalls: 0, status: [] as string[] };
    const frame = { runId: "run-1", query: "budgeting", mode: "deep", startedAt: "2026-11-14T00:00:00Z", seed: "budgeting" };
    const summary = await finishPastedRun(frame, deps(state), 2);
    assert.equal(summary.status, "failed");
    assert.match(summary.error ?? "", /Only 0 of 2 signals were analysed/);
  });

  it("collecting nothing fails the run instead of handing out an empty prompt", async () => {
    const state = { analysed: false, extractCalls: 0, status: [] as string[] };
    const empty = await startPastedRun({ query: "zzzz" }, { ...deps(state), getSignals: async () => [] });
    assert.equal(empty.status, "failed");
  });

  it("the one-request model run still works through the same phases", async () => {
    const state = { analysed: true, extractCalls: 0, status: [] as string[] };
    const summary = await executeResearchRun({ query: "budgeting" }, deps(state));
    assert.equal(summary.status, "completed", summary.error ?? "");
    assert.deepEqual(summary.trace.map((t) => t.state).slice(0, 4), ["queued", "collecting", "normalizing", "classifying"]);
  });
});
