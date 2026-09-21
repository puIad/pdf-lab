// lib/search/search.test.ts — Unit and acceptance tests for Market Search & PRD §8 Overview.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateMarketOverview, getSearchHistory, createEmptyOverview } from "./overview.ts";
import type { MarketOverview } from "./types.ts";

// Mock Supabase client for deterministic unit testing
function createMockSupabase(dataset: {
  markets?: unknown[];
  signals?: unknown[];
  market_signals?: unknown[];
  evidence?: unknown[];
  opportunities?: unknown[];
  competitors?: unknown[];
  research_runs?: unknown[];
}) {
  const researchRuns = [...(dataset.research_runs || [])];

  return {
    from(table: string) {
      return {
        select() {
          return {
            order() {
              return this;
            },
            limit() {
              return this;
            },
            in() {
              return this;
            },
            eq() {
              return this;
            },
            async then(resolve: (result: { data: unknown[]; error: null }) => unknown) {
              if (table === "markets") return resolve({ data: dataset.markets || [], error: null });
              if (table === "signals") return resolve({ data: dataset.signals || [], error: null });
              if (table === "market_signals") return resolve({ data: dataset.market_signals || [], error: null });
              if (table === "evidence") return resolve({ data: dataset.evidence || [], error: null });
              if (table === "opportunities") return resolve({ data: dataset.opportunities || [], error: null });
              if (table === "competitors") return resolve({ data: dataset.competitors || [], error: null });
              if (table === "research_runs") return resolve({ data: researchRuns, error: null });
              return resolve({ data: [], error: null });
            },
          };
        },
        insert(record: Record<string, unknown>) {
          const inserted = { id: `mock-run-${Date.now()}`, ...record };
          researchRuns.unshift(inserted);
          return {
            select() {
              return {
                single: async () => ({ data: inserted, error: null }),
              };
            },
          };
        },
      };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("PRD §8 Market Overview Aggregator", () => {
  test("createEmptyOverview returns unobserved for all 9 dimensions with zero confidence", () => {
    const empty = createEmptyOverview("quantum farming", "explore", new Date().toISOString());

    assert.equal(empty.query, "quantum farming");
    assert.equal(empty.confidence, 0);
    assert.equal(empty.matchedMarketsCount, 0);
    assert.equal(empty.matchedSignalsCount, 0);

    // All 9 dimensions must be observed: false and rawLabel: "Not observed"
    const dimensions = [
      empty.sizeProxy,
      empty.searchInterest,
      empty.trendDirection,
      empty.discussionCounts,
      empty.buyerIntentSignals,
      empty.marketplaceActivity,
      empty.competitiveDensity,
      empty.pains,
      empty.underservedSubmarkets,
    ];

    for (const d of dimensions) {
      assert.equal(d.observed, false);
      assert.equal(d.rawLabel, "Not observed");
      assert.equal(d.value, null);
      assert.deepEqual(d.evidence, []);
      assert.ok(typeof d.note === "string" && d.note.length > 0);
    }
  });

  test("Probe 1: Rich query ('pc troubleshooting') returns observed metrics citing evidence", async () => {
    const mockSupabase = createMockSupabase({
      markets: [
        {
          id: "m-1",
          name: "PC Fault Diagnosis and Repair",
          description: "Hardware failures, BSODs, and troubleshooting workflows",
          trend: "stable",
          demand_score: 87,
          competition_score: 25,
          pdf_fit_score: 82,
          confidence: 0.85,
        },
      ],
      signals: [
        {
          id: "s-1",
          source_id: "src-1",
          url: "https://reddit.com/r/buildapc/comments/1",
          title: "PC won't boot, need troubleshooting guide",
          content: "I need a diagnostic flowchart to fix my pc troubleshooting steps, willing to pay for a good guide",
          published_at: "2026-08-01T10:00:00Z",
          collected_at: "2026-08-02T10:00:00Z",
          engagement: { upvotes: 45, comments: 12 },
          sources: { type: "reddit", name: "Reddit" },
          signal_analysis: {
            audience: "Gamer PC Builders",
            problem: "Unbootable PC without POST codes",
            intent: "strong",
            urgency: "high",
            pdf_relevance: 0.9,
          },
        },
        {
          id: "s-2",
          source_id: "src-2",
          url: "https://reddit.com/r/techsupport/comments/2",
          title: "Intermittent BSOD crash guide",
          content: "Looking to buy a comprehensive diagnostic checklist for pc troubleshooting",
          published_at: "2026-09-01T10:00:00Z",
          collected_at: "2026-09-02T10:00:00Z",
          engagement: { upvotes: 20, comments: 8 },
          sources: { type: "reddit", name: "Reddit" },
          signal_analysis: {
            audience: "IT Enthusiasts",
            problem: "Kernel panic memory faults",
            intent: "very_strong",
            urgency: "high",
            pdf_relevance: 0.95,
          },
        },
      ],
      competitors: [
        {
          id: "c-1",
          market_id: "m-1",
          platform: "gumroad",
          title: "The Ultimate PC Diagnostic Flowchart",
          price: "$19",
          url: "https://gumroad.com/l/pcdiag",
        },
      ],
      opportunities: [
        {
          id: "o-1",
          market_id: "m-1",
          title: "Zero-Boot Emergency PC Diagnostic Checklist",
          target_audience: "Desktop Gamers & Remote Workers",
          problem: "PC will not turn on after power surge",
          solution: "Printable single-page emergency flowchart",
          opportunity_score: 82,
          confidence: 0.88,
        },
      ],
      evidence: [
        {
          id: "e-1",
          entity_type: "market",
          entity_id: "m-1",
          claim: "Observed high failure rate in RAM seated incorrectly",
          excerpt: "Motherboard debug LEDs flashing yellow",
          url: "https://reddit.com/r/buildapc/comments/1",
          created_at: "2026-09-10T00:00:00Z",
        },
      ],
    });

    const overview = await generateMarketOverview("pc troubleshooting", mockSupabase, {
      mode: "explore",
      persistRun: true,
      userId: "user-123",
    });

    assert.equal(overview.query, "pc troubleshooting");
    assert.equal(overview.matchedMarketsCount, 1);
    assert.equal(overview.matchedSignalsCount, 2);
    assert.ok(overview.confidence > 0.1);
    assert.ok(overview.runId);

    // 1. Size Proxy: observed with evidence
    assert.equal(overview.sizeProxy.observed, true);
    assert.equal(overview.sizeProxy.value?.totalSignals, 2);
    assert.ok(overview.sizeProxy.evidence.length > 0);

    // 2. Trend Direction: observed with temporal spread
    assert.equal(overview.trendDirection.observed, true);
    assert.equal(overview.trendDirection.value?.direction, "stable");
    assert.ok(overview.trendDirection.evidence.length > 0);

    // 3. Discussion counts: observed
    assert.equal(overview.discussionCounts.observed, true);
    assert.equal(overview.discussionCounts.value?.total, 2);
    assert.equal(overview.discussionCounts.value?.bySource.reddit, 2);
    assert.ok(overview.discussionCounts.evidence.length > 0);

    // 4. Buyer intent: observed with very_strong and strong
    assert.equal(overview.buyerIntentSignals.observed, true);
    assert.ok((overview.buyerIntentSignals.value?.veryStrongCount ?? 0) >= 1);
    assert.ok(overview.buyerIntentSignals.evidence.length > 0);

    // 5. Marketplace activity: observed gumroad competitor
    assert.equal(overview.marketplaceActivity.observed, true);
    assert.equal(overview.marketplaceActivity.value?.productsCount, 1);
    assert.equal(overview.marketplaceActivity.value?.platforms.gumroad, 1);
    assert.ok(overview.marketplaceActivity.evidence.length > 0);

    // 6. Competitive density: observed
    assert.equal(overview.competitiveDensity.observed, true);
    assert.equal(overview.competitiveDensity.value?.densityRating, "low");
    assert.ok(overview.competitiveDensity.evidence.length > 0);

    // 7. Pains: observed
    assert.equal(overview.pains.observed, true);
    assert.ok(overview.pains.value?.items.length ?? 0 > 0);
    assert.ok(overview.pains.evidence.length > 0);

    // 8. Underserved submarkets: observed
    assert.equal(overview.underservedSubmarkets.observed, true);
    assert.ok(overview.underservedSubmarkets.value?.items.length ?? 0 > 0);
    assert.ok(overview.underservedSubmarkets.evidence.length > 0);
  });

  test("Probe 2: Partial query ('students') correctly separates observed from unobserved", async () => {
    const mockSupabase = createMockSupabase({
      signals: [
        {
          id: "s-students-1",
          source_id: "src-1",
          url: "https://reddit.com/r/college/1",
          title: "College students struggling with exam schedules",
          content: "Looking for an exam study planner checklist for college students",
          published_at: "2026-09-15T00:00:00Z",
          collected_at: "2026-09-15T01:00:00Z",
          sources: { type: "reddit", name: "Reddit" },
          signal_analysis: {
            audience: "College Students",
            problem: "Exam schedule cramming",
            intent: "medium",
            urgency: "medium",
            pdf_relevance: 0.8,
          },
        },
      ],
      // No markets, no competitors, no gtrends
      markets: [],
      competitors: [],
      opportunities: [],
      evidence: [],
    });

    const overview = await generateMarketOverview("students", mockSupabase, {
      mode: "explore",
    });

    assert.equal(overview.query, "students");
    assert.equal(overview.matchedSignalsCount, 1);

    // Observed dimensions
    assert.equal(overview.sizeProxy.observed, true);
    assert.ok(overview.sizeProxy.evidence.length > 0);

    assert.equal(overview.discussionCounts.observed, true);
    assert.ok(overview.discussionCounts.evidence.length > 0);

    assert.equal(overview.buyerIntentSignals.observed, true);
    assert.ok(overview.buyerIntentSignals.evidence.length > 0);

    assert.equal(overview.pains.observed, true);
    assert.ok(overview.pains.evidence.length > 0);

    // Unobserved dimensions (honestly unobserved)
    assert.equal(overview.marketplaceActivity.observed, false);
    assert.equal(overview.marketplaceActivity.rawLabel, "Not observed");
    assert.deepEqual(overview.marketplaceActivity.evidence, []);

    assert.equal(overview.searchInterest.observed, false);
    assert.equal(overview.searchInterest.rawLabel, "Not observed");
    assert.deepEqual(overview.searchInterest.evidence, []);

    assert.equal(overview.competitiveDensity.observed, false);
    assert.equal(overview.competitiveDensity.rawLabel, "Not observed");
    assert.deepEqual(overview.competitiveDensity.evidence, []);

    assert.equal(overview.underservedSubmarkets.observed, false);
    assert.equal(overview.underservedSubmarkets.rawLabel, "Not observed");
    assert.deepEqual(overview.underservedSubmarkets.evidence, []);
  });

  test("Probe 3: Novel unobserved query ('underwater basket weaving') returns ALL lines as unobserved", async () => {
    const mockSupabase = createMockSupabase({
      markets: [],
      signals: [],
      competitors: [],
      opportunities: [],
      evidence: [],
    });

    const overview = await generateMarketOverview("underwater basket weaving", mockSupabase, {
      mode: "explore",
    });

    assert.equal(overview.query, "underwater basket weaving");
    assert.equal(overview.confidence, 0);
    assert.equal(overview.matchedMarketsCount, 0);
    assert.equal(overview.matchedSignalsCount, 0);

    // Every single dimension must say "Not observed" with empty evidence
    const dims: Array<keyof MarketOverview> = [
      "sizeProxy",
      "searchInterest",
      "trendDirection",
      "discussionCounts",
      "buyerIntentSignals",
      "marketplaceActivity",
      "competitiveDensity",
      "pains",
      "underservedSubmarkets",
    ];

    for (const key of dims) {
      const metric = overview[key] as { observed: boolean; rawLabel: string; evidence: unknown[] };
      assert.equal(metric.observed, false, `${key} should be unobserved`);
      assert.ok(
        metric.rawLabel.startsWith("Not observed"),
        `${key} rawLabel should start with "Not observed", got "${metric.rawLabel}"`
      );
      assert.equal(metric.evidence.length, 0, `${key} should have zero evidence citations`);
    }
  });

  test("QC Rule 2: Trend claims reject single-point data and require temporal evidence", async () => {
    // Only 1 dated signal at a single timestamp, no market trend
    const mockSupabase = createMockSupabase({
      signals: [
        {
          id: "s-1",
          title: "Signal at a single point in time",
          content: "Single post",
          published_at: "2026-09-20T12:00:00Z",
          collected_at: "2026-09-20T12:00:00Z",
          sources: { type: "web" },
        },
      ],
      markets: [],
      evidence: [],
    });

    const overview = await generateMarketOverview("point in time", mockSupabase);

    assert.equal(overview.trendDirection.observed, false);
    assert.ok(overview.trendDirection.rawLabel.includes("Not observed"));
    assert.ok(overview.trendDirection.note?.includes("QC Rule 2"));
    assert.equal(overview.trendDirection.evidence.length, 0);
  });

  test("Search History: Persists research_runs per user and can query history", async () => {
    const mockSupabase = createMockSupabase({
      research_runs: [
        {
          id: "run-existing-1",
          query: "pc troubleshooting",
          mode: "explore",
          status: "completed",
          started_at: "2026-09-20T10:00:00Z",
          user_id: "user-alpha",
        },
      ],
    });

    // Run search for user-alpha
    const overview = await generateMarketOverview("cybersecurity checklists", mockSupabase, {
      userId: "user-alpha",
      mode: "validate",
      persistRun: true,
    });

    assert.ok(overview.runId);

    // Query history
    const history = await getSearchHistory(mockSupabase, {
      userId: "user-alpha",
    });

    assert.ok(history.length >= 2);
    assert.equal(history[0].query, "cybersecurity checklists");
    assert.equal(history[0].mode, "validate");
    assert.equal(history[0].user_id, "user-alpha");
  });
});
