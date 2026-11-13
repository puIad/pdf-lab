// lib/runs/run-scope.test.ts — Part 6.7: a run's rows belong to the run.
// Run: `pnpm test` (node:test, zero network, zero DB).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isStoreUrl, marketForCompetitor, type CompetitorMarket } from "../competition/map.ts";
import { loadRunSignals, recordRunSignals } from "./run-signals.ts";
import { isCurrent, listCompletedRuns } from "./scope.ts";
import { fetchMarketsData, parseMarketScope } from "../markets/fetcher.ts";
import { executeResearchRun, type OrchestratorDeps, type StoredSignalForRun } from "./orchestrator.ts";

type Call = { table: string; method: string; args: unknown[] };

/** Records every query; each table answers with its rows whatever the filters. */
function fakeSupabase(tables: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "or", "order", "range", "upsert", "not"]) {
        q[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return q;
        };
      }
      q.then = (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("marketForCompetitor", () => {
  const markets: CompetitorMarket[] = [
    { id: "m-debt", name: "Paying off credit card debt", signalIds: ["s1"], texts: ["cannot pay down credit card debt snowball"] },
    { id: "m-meal", name: "Grocery spending", signalIds: ["s2"], texts: ["weekly grocery bill too high meal planning"] },
  ];

  it("keeps a listing in the market it was clustered into", () => {
    assert.equal(marketForCompetitor({ title: "Unrelated words entirely", signalId: "s2" }, markets, "budgeting"), "m-meal");
  });

  it("maps by the title's words, ignoring the seed every listing shares", () => {
    assert.equal(marketForCompetitor({ title: "Debt Snowball Tracker Budgeting Printable" }, markets, "budgeting"), "m-debt");
    assert.equal(marketForCompetitor({ title: "Grocery Meal Planning Budgeting Sheet" }, markets, "budgeting"), "m-meal");
  });

  it("leaves a listing unassigned when it overlaps no market beyond the seed", () => {
    assert.equal(marketForCompetitor({ title: "Budgeting Planner for Teachers Classroom Edition" }, markets, "budgeting"), null);
    assert.equal(marketForCompetitor({ title: "Budgeting" }, markets, "budgeting"), null);
    assert.equal(marketForCompetitor({ title: "Debt tracker" }, [], "budgeting"), null);
  });
});

describe("isStoreUrl", () => {
  it("accepts known stores and rejects everything else", () => {
    assert.equal(isStoreUrl("https://www.etsy.com/listing/1/budget-planner"), true);
    assert.equal(isStoreUrl("https://someone.gumroad.com/l/abc"), true);
    assert.equal(isStoreUrl("https://www.amazon.co.uk/dp/B000000000"), true);
    assert.equal(isStoreUrl("https://www.nerdwallet.com/article/budgeting-guide"), false);
    assert.equal(isStoreUrl("https://notetsy.com.example.org/guide"), false);
    assert.equal(isStoreUrl(null), false);
    assert.equal(isStoreUrl("not a url"), false);
  });
});

describe("run signals", () => {
  it("reads a run's signals through run_signals, never a text match on signals", async () => {
    const { client, calls } = fakeSupabase({
      run_signals: [
        {
          signal_id: "s1",
          signals: {
            id: "s1", title: "t", content: "c", url: "u", source_id: "src", external_id: "e1", published_at: null,
            sources: { type: "reddit" },
            signal_analysis: [{ id: "a1", audience: "a", problem: "p", intent: "strong", urgency: "high", pdf_relevance: 0.8, embedding: "[0.1,0.2]" }],
          },
        },
      ],
    });
    const rows = await loadRunSignals(client, "run-1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_type, "reddit");
    assert.deepEqual(rows[0].analysis?.embedding, [0.1, 0.2]);
    assert.deepEqual([...new Set(calls.map((c) => c.table))], ["run_signals"]);
    assert.ok(calls.some((c) => c.method === "eq" && c.args[0] === "run_id" && c.args[1] === "run-1"));
    assert.equal(calls.some((c) => c.method === "or"), false);
  });

  it("links the signals an ingest returned to the run", async () => {
    const { client, calls } = fakeSupabase({ sources: [{ id: "src-1", type: "reddit" }], signals: [{ id: "sig-a" }, { id: "sig-b" }] });
    const linked = await recordRunSignals(client, "run-1", new Map([["reddit", ["e1", "e2"]], ["youtube", []]]));
    assert.equal(linked, 2);
    const upsert = calls.find((c) => c.table === "run_signals" && c.method === "upsert");
    assert.deepEqual(upsert?.args[0], [{ run_id: "run-1", signal_id: "sig-a" }, { run_id: "run-1", signal_id: "sig-b" }]);
    assert.ok(calls.some((c) => c.table === "signals" && c.method === "in" && c.args[0] === "external_id"));
    assert.equal(await recordRunSignals(client, "run-1", new Map()), 0);
  });
});

describe("run scope for readers", () => {
  const runs = [
    { id: "11111111-1111-4111-8111-111111111111", query: "Budgeting", completed_at: "2026-11-13T10:00:00Z" },
    { id: "22222222-2222-4222-8222-222222222222", query: "meal prep", completed_at: "2026-11-12T10:00:00Z" },
    { id: "33333333-3333-4333-8333-333333333333", query: "budgeting ", completed_at: "2026-11-01T10:00:00Z" },
  ];
  const market = (id: string, run_id: string | null) => ({ id, run_id, name: id, created_at: "2026-11-13T00:00:00Z" });
  const tables = {
    research_runs: runs,
    markets: [market("new-budget", runs[0].id), market("meal", runs[1].id), market("old-budget", runs[2].id), market("legacy", null)],
  };

  it("marks the newest completed run of each seed as latest", async () => {
    const list = await listCompletedRuns(fakeSupabase(tables).client);
    assert.deepEqual(list.map((r) => r.latest), [true, true, false]);
    const latest = new Set(list.filter((r) => r.latest).map((r) => r.id));
    assert.equal(isCurrent(null, latest), true);
    assert.equal(isCurrent(runs[2].id, latest), false);
  });

  it("explorer scopes: latest runs, one run, legacy, never every run mixed", async () => {
    const names = async (scope?: string) => (await fetchMarketsData(fakeSupabase(tables).client, scope)).markets.map((m) => m.name).sort();
    assert.deepEqual(await names("latest"), ["meal", "new-budget"]);
    assert.deepEqual(await names(runs[2].id), ["old-budget"]);
    assert.deepEqual(await names("legacy"), ["legacy"]);
    assert.deepEqual(await names(), ["legacy", "meal", "new-budget"]);
    const res = await fetchMarketsData(fakeSupabase(tables).client, "latest");
    assert.equal(res.legacyCount, 1);
    assert.deepEqual(res.runs.map((r) => r.id), runs.map((r) => r.id));
  });

  it("only accepts a known scope word or a run id", () => {
    assert.equal(parseMarketScope("legacy", "latest"), "legacy");
    assert.equal(parseMarketScope(runs[0].id, "latest"), runs[0].id);
    assert.equal(parseMarketScope("1 or 1=1", "latest"), "latest");
    assert.equal(parseMarketScope(undefined, "latest"), "latest");
  });
});

describe("executeResearchRun writes run_id and maps competitors", () => {
  const sig = (id: string, problem: string): StoredSignalForRun => ({
    id, title: problem, content: problem, url: `https://reddit.com/${id}`, source_id: "src-reddit", source_type: "reddit",
    published_at: "2026-11-01T00:00:00Z",
    analysis: { id: `a-${id}`, audience: "households", problem, intent: "strong", urgency: "high", pdf_relevance: 0.8, embedding: [0.1] },
  });
  const signals = [sig("s1", "cannot pay down credit card debt"), sig("s2", "weekly grocery bill too high")];

  it("saves markets, opportunities and competitors with the run id, each competitor on its own market", async () => {
    const seen: { ingestRun?: string; signalRuns: string[]; marketRun?: string; oppRun?: string; completenessRun?: string } = { signalRuns: [] };
    let competitors: Array<{ run_id: string; market_id: string | null; title: string }> = [];
    const evidence: Array<{ entityType: string; entityId: string; claim: string }> = [];
    const deps: OrchestratorDeps = {
      createRun: async () => ({ id: "run-9", started_at: new Date().toISOString() }),
      updateRunStatus: async () => {},
      ingest: async ({ runId }) => {
        seen.ingestRun = runId;
        return { collected: 2, normalized: 2, inserted: 2, sources: [{ key: "reddit", status: "ok", count: 2 }] };
      },
      getSignals: async (runId) => {
        seen.signalRuns.push(runId);
        return signals;
      },
      extract: async () => ({ analyzed: 0, succeeded: 0, failed: 0 }),
      clusterAndScore: async (all) => [
        { id: "c1", name: "Credit card debt", trend: "stable", demandScore: 60, confidence: 0.6, pdfFitScore: 70, signals: [all[0]] },
        { id: "c2", name: "Grocery spending", trend: "stable", demandScore: 50, confidence: 0.6, pdfFitScore: 70, signals: [all[1]] },
      ],
      saveMarkets: async (markets, runId) => {
        seen.marketRun = runId;
        return markets.map((m, i) => ({ id: `market-${i + 1}`, name: m.name }));
      },
      saveEvidence: async (items) => {
        evidence.push(...items);
        return items.map((item, i) => ({
          id: `ev-${evidence.length}-${i}`, entity_type: item.entityType, entity_id: item.entityId, source_id: item.sourceId ?? null,
          claim: item.claim, excerpt: item.excerpt ?? null, url: item.url ?? null, created_at: new Date().toISOString(),
        }));
      },
      generateOpportunities: async (markets) => [
        {
          opportunity: {
            id: "opp-1", marketId: markets[0].id, title: "Debt payoff tracker", targetAudience: "households",
            problem: "cannot pay down credit card debt", solution: "tracker", format: "planner",
            priceRange: markets[0].priceRange ?? null, opportunityScore: 70, confidence: 0.6,
          },
          evidence: [{ entityType: "opportunity", entityId: "opp-1", sourceId: "src-reddit", claim: "c", excerpt: "e", url: "u", signalType: "pain_point", confidence: 0.6 }],
        },
      ],
      saveOpportunities: async (items, runId) => {
        seen.oppRun = runId;
        return items.map((i) => ({ id: i.id, title: i.title }));
      },
      observeCompetition: async () => [
        { platform: "etsy", title: "Credit Card Debt Payoff Tracker Budgeting Printable", url: "https://etsy.com/1", price: "$4.99" },
        { platform: "etsy", title: "Grocery Bill Budgeting Sheet", url: "https://etsy.com/2", price: "$3.00" },
        { platform: "gumroad", title: "Budgeting Planner for Teachers Classroom Edition", url: "https://gumroad.com/3", price: "$9" },
      ],
      saveCompetitors: async (rows) => {
        competitors = rows;
        return rows.map((_, i) => ({ id: `comp-${i}` }));
      },
      fetchCompleteness: async (runId) => {
        seen.completenessRun = runId;
        return {
          sourcesCovered: 1, signalsCollected: 2, signalsAnalyzed: 2, marketsIdentified: 2, opportunitiesGenerated: 1,
          evidenceCount: evidence.length, evidenceBackedOpportunitiesCount: 1, completenessPercentage: 80,
        };
      },
    };

    const result = await executeResearchRun({ query: "budgeting" }, deps);
    assert.equal(result.status, "completed", result.error ?? "");
    assert.deepEqual(
      [seen.ingestRun, seen.marketRun, seen.oppRun, seen.completenessRun, ...new Set(seen.signalRuns)],
      ["run-9", "run-9", "run-9", "run-9", "run-9"],
    );
    assert.deepEqual(
      competitors.map((c) => [c.run_id, c.market_id]),
      [["run-9", "market-1"], ["run-9", "market-2"], ["run-9", null]],
    );
    // Competition evidence follows the mapping; the unmapped listing hangs off the run, not the first market.
    const compEvidence = evidence.filter((e) => e.entityType === "competition" && e.claim.startsWith("Observed competitor"));
    assert.deepEqual(compEvidence.map((e) => e.entityId), ["market-1", "market-2", "run-9"]);
  });
});
