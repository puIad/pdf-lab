// lib/runs/orchestrator.test.ts — Unit tests for research run lifecycle, trace, and QC enforcement.
// Run: `pnpm test` (node:test + node:assert, zero network, zero DB).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidTransition, LifecycleTracker } from "./lifecycle.ts";
import { calculateCompleteness } from "./completeness.ts";
import { executeResearchRun } from "./orchestrator.ts";
import type { OrchestratorDeps, StoredSignalForRun } from "./orchestrator.ts";
import type { EvidenceRow } from "../evidence/types.ts";
import type { LifecycleState } from "./types.ts";

describe("Lifecycle state machine & tracker", () => {
  it("allows valid sequential transitions", () => {
    assert.equal(isValidTransition("queued", "collecting"), true);
    assert.equal(isValidTransition("collecting", "normalizing"), true);
    assert.equal(isValidTransition("normalizing", "classifying"), true);
    assert.equal(isValidTransition("report_generation", "completed"), true);
    assert.equal(isValidTransition("clustering", "failed"), true);
  });

  it("rejects illegal transitions (backward, duplicate, or from terminal)", () => {
    assert.equal(isValidTransition("clustering", "collecting"), false);
    assert.equal(isValidTransition("completed", "queued"), false);
    assert.equal(isValidTransition("failed", "normalizing"), false);
    assert.equal(isValidTransition("collecting", "collecting"), false);
  });

  it("LifecycleTracker records transitions, durations, and counts", () => {
    const tracker = new LifecycleTracker("queued", "Run created");
    assert.equal(tracker.getCurrentState(), "queued");

    tracker.transition("collecting", { counts: { limit: 10 } });
    tracker.transition("normalizing", { counts: { normalized: 8 } });

    const trace = tracker.getTrace();
    assert.equal(trace.length, 3);
    assert.equal(trace[0].state, "queued");
    assert.equal(trace[1].state, "collecting");
    assert.equal(trace[1].counts?.limit, 10);
    assert.equal(trace[2].state, "normalizing");
    assert.equal(trace[2].counts?.normalized, 8);
  });
});

describe("calculateCompleteness", () => {
  it("calculates weighted completeness percentage accurately", () => {
    const c1 = calculateCompleteness({
      sourcesCovered: 3, // 20%
      signalsCollected: 20, // 20%
      signalsAnalyzed: 20, // 20%
      marketsIdentified: 2, // 15%
      opportunitiesGenerated: 4, // 25%
      evidenceCount: 12,
      evidenceBackedOpportunitiesCount: 4, // 100% of opps
    });

    assert.equal(c1.completenessPercentage, 100);
    assert.equal(c1.sourcesCovered, 3);
    assert.equal(c1.evidenceCount, 12);
  });

  it("reflects partial completeness honestly when data is thin", () => {
    const c2 = calculateCompleteness({
      sourcesCovered: 1, // ~6.7%
      signalsCollected: 5, // ~5%
      signalsAnalyzed: 5, // 20%
      marketsIdentified: 1, // 15%
      opportunitiesGenerated: 2,
      evidenceCount: 3,
      evidenceBackedOpportunitiesCount: 1, // 50% of opps = 12.5%
    });

    assert.ok(c2.completenessPercentage < 65);
    assert.ok(c2.completenessPercentage > 40);
  });
});

function createMockOrchestratorDeps(overrides?: Partial<OrchestratorDeps>): {
  deps: OrchestratorDeps;
  state: {
    runStatus: LifecycleState;
    storedEvidence: EvidenceRow[];
    createdMarkets: Array<{ id: string; name: string }>;
    createdOpps: Array<{ id: string; title: string }>;
  };
} {
  const state = {
    runStatus: "queued" as LifecycleState,
    storedEvidence: [] as EvidenceRow[],
    createdMarkets: [] as Array<{ id: string; name: string }>,
    createdOpps: [] as Array<{ id: string; title: string }>,
  };

  const sampleSignals: StoredSignalForRun[] = [
    {
      id: "sig-1",
      title: "PC won't boot post update",
      content: "Fans spin 100% but monitor black screen",
      url: "https://reddit.com/r/buildapc/1",
      source_id: "src-reddit",
      source_type: "reddit",
      published_at: "2026-09-01T12:00:00Z",
      analysis: {
        id: "sa-1",
        audience: "PC users",
        problem: "No boot after Windows update",
        intent: "strong",
        urgency: "high",
        pdf_relevance: 0.85,
        embedding: [0.1, 0.2],
      },
    },
    {
      id: "sig-2",
      title: "Diagnostic POST checklist search",
      content: "Google trends search spike for POST failure",
      url: "https://trends.google.com/q=post",
      source_id: "src-trends",
      source_type: "gtrends",
      published_at: "2026-09-02T12:00:00Z",
      analysis: {
        id: "sa-2",
        audience: "builders",
        problem: "Need POST diagnostic steps",
        intent: "strong",
        urgency: "medium",
        pdf_relevance: 0.9,
        embedding: [0.1, 0.2],
      },
    },
  ];

  const defaultDeps: OrchestratorDeps = {
    createRun: async () => ({
      id: "run-test-123",
      started_at: new Date().toISOString(),
    }),
    updateRunStatus: async (id, status) => {
      state.runStatus = status;
    },
    ingest: async () => ({
      collected: 2,
      normalized: 2,
      inserted: 2,
      sources: [
        { key: "reddit", status: "ok", count: 1 },
        { key: "gtrends", status: "ok", count: 1 },
      ],
    }),
    getSignals: async () => sampleSignals,
    extract: async () => ({ analyzed: 2, succeeded: 2, failed: 0 }),
    clusterAndScore: async (signals) => [
      {
        id: "market-1",
        name: "PC Boot Diagnostics & POST Recovery",
        trend: "accelerating",
        demandScore: 84,
        confidence: 0.78,
        pdfFitScore: 85,
        signals,
      },
    ],
    saveMarkets: async (markets) => {
      state.createdMarkets = markets.map((m) => ({ id: m.id, name: m.name }));
      return state.createdMarkets;
    },
    saveEvidence: async (items) => {
      const rows: EvidenceRow[] = items.map((item, idx) => ({
        id: `ev-mock-${state.storedEvidence.length + idx + 1}`,
        entity_type: item.entityType,
        entity_id: item.entityId,
        source_id: item.sourceId ?? null,
        claim: item.claim,
        excerpt: item.excerpt ?? null,
        url: item.url ?? null,
        created_at: new Date().toISOString(),
      }));
      state.storedEvidence.push(...rows);
      return rows;
    },
    generateOpportunities: async (markets) => [
      {
        opportunity: {
          id: "opp-1",
          marketId: markets[0].id,
          title: "POST Error Diagnostic Flowchart & Quick Reference",
          targetAudience: "First-time PC builders and troubleshooting techs",
          problem: "Black screen upon powering up",
          solution: "Printable step-by-step LED code and beep code decision tree",
          format: "checklist",
          opportunityScore: 86,
          confidence: 0.8,
        },
        evidence: [
          {
            entityType: "opportunity",
            entityId: "opp-1",
            sourceId: "src-reddit",
            claim: "Demand for printable step-by-step diagnostic tree",
            excerpt: "Monitor black screen fans spin",
            url: "https://reddit.com/r/buildapc/1",
            signalType: "pdf_fit",
            confidence: 0.85,
          },
        ],
      },
    ],
    saveOpportunities: async (items) => {
      state.createdOpps = items.map((i) => ({ id: i.id, title: i.title }));
      return state.createdOpps;
    },
    observeCompetition: async () => [],
    fetchCompleteness: async () => ({
      sourcesCovered: 2,
      signalsCollected: 2,
      signalsAnalyzed: 2,
      marketsIdentified: 1,
      opportunitiesGenerated: 1,
      evidenceCount: state.storedEvidence.length,
      evidenceBackedOpportunitiesCount: 1,
      completenessPercentage: 85,
    }),
    ...overrides,
  };

  return { deps: defaultDeps, state };
}

describe("executeResearchRun (lifecycle & acceptance)", () => {
  it("full run returns COMPLETED with complete 10-state lifecycle trace", async () => {
    const { deps, state } = createMockOrchestratorDeps();

    const result = await executeResearchRun({ query: "pc troubleshooting", mode: "deep" }, deps);

    assert.equal(result.status, "completed");
    assert.equal(result.runId, "run-test-123");
    assert.equal(result.query, "pc troubleshooting");
    assert.ok(result.completedAt != null);

    // Verify all 10 states appear in order in the trace
    const traceStates = result.trace.map((t) => t.state);
    assert.deepEqual(traceStates, [
      "queued",
      "collecting",
      "normalizing",
      "classifying",
      "clustering",
      "trend_analysis",
      "competition_analysis",
      "opportunity_generation",
      "report_generation",
      "completed",
    ]);

    // Verify evidence rows were stored
    assert.ok(state.storedEvidence.length >= 3);
    assert.ok(state.storedEvidence.some((e) => e.entity_type === "market"));
    assert.ok(state.storedEvidence.some((e) => e.entity_type === "trend"));
    assert.ok(state.storedEvidence.some((e) => e.entity_type === "opportunity"));

    // Verify completeness
    assert.equal(result.completeness.completenessPercentage, 85);
    assert.equal(result.completeness.marketsIdentified, 1);
    assert.equal(result.completeness.opportunitiesGenerated, 1);
    assert.equal(result.completeness.evidenceBackedOpportunitiesCount, 1);
  });

  it("Acceptance Gate: zero-evidence run is impossible by construction (test asserts block)", async () => {
    // When a run fails to produce any evidence rows (e.g. all empty)
    const { deps, state } = createMockOrchestratorDeps({
      clusterAndScore: async () => [],
      saveMarkets: async () => [],
      generateOpportunities: async () => [],
      saveOpportunities: async () => [],
      saveEvidence: async () => [],
      fetchCompleteness: async () => ({
        sourcesCovered: 0,
        signalsCollected: 0,
        signalsAnalyzed: 0,
        marketsIdentified: 0,
        opportunitiesGenerated: 0,
        evidenceCount: 0,
        evidenceBackedOpportunitiesCount: 0,
        completenessPercentage: 0,
      }),
    });

    const result = await executeResearchRun({ query: "nonsense-query" }, deps);

    // Run MUST fail and NEVER mark completed
    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("zero evidence rows"));
    assert.equal(state.runStatus, "failed");
    const lastTrace = result.trace[result.trace.length - 1];
    assert.equal(lastTrace.state, "failed");
  });

  it("Acceptance Gate: QC Rule 1 blocks opportunity without evidence during run", async () => {
    // Attempting to generate an opportunity with 0 evidence
    const { deps, state } = createMockOrchestratorDeps({
      generateOpportunities: async () => [
        {
          opportunity: {
            id: "opp-hallucinated",
            marketId: "market-1",
            title: "Fake Opportunity With Zero Evidence",
            targetAudience: "Nobody",
            problem: "Invented problem",
            solution: "Imaginary PDF",
            format: "guide",
            opportunityScore: 99,
            confidence: 0.9,
          },
          evidence: [], // VIOLATION OF QC RULE 1
        },
      ],
    });

    const result = await executeResearchRun({ query: "pc troubleshooting" }, deps);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("QC Rule 1 Violation"));
    assert.ok(result.error?.includes("0 evidence rows"));
    assert.equal(state.runStatus, "failed");
  });

  it("keeps search-suggestion, Serper phrase and pageview rows out of extraction and clustering", async () => {
    const demandRow = (id: string, source_type: string): StoredSignalForRun => ({
      id,
      title: `Search suggestion: "${id}"`,
      content: null,
      url: null,
      source_id: `src-${source_type}`,
      source_type,
      published_at: null,
    });
    const extracted: string[] = [];
    const clustered: string[] = [];
    const base = createMockOrchestratorDeps();
    const original = await base.deps.getSignals("pc troubleshooting");
    const { deps } = createMockOrchestratorDeps({
      getSignals: async () => [
        ...original,
        demandRow("ac-1", "autocomplete"),
        demandRow("wk-1", "wikipedia"),
        { ...demandRow("paa-1", "web"), external_id: "serp:us:abc:2026-10-24" },
      ],
      extract: async (rows) => {
        extracted.push(...rows.map((r) => r.id));
        return { analyzed: rows.length, succeeded: rows.length, failed: 0 };
      },
      clusterAndScore: async (signals) => {
        clustered.push(...signals.map((s) => s.id));
        return base.deps.clusterAndScore(signals);
      },
    });

    const result = await executeResearchRun({ query: "pc troubleshooting", mode: "deep" }, deps);
    assert.equal(result.status, "completed");
    assert.deepEqual(extracted, [], "the only unanalyzed rows were demand rows");
    assert.deepEqual(clustered.sort(), ["sig-1", "sig-2"]);
  });
});
