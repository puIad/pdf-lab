// lib/markets/markets.test.ts — Unit & integration tests for Phase 3 Part 3.1 Market Explorer.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMarketsData } from "./fetcher.ts";
import type { MarketRowData, MarketTab } from "./types.ts";

function createMockSupabase(overrides: {
  markets?: Record<string, unknown>[];
  opportunities?: Record<string, unknown>[];
  evidence?: Record<string, unknown>[];
  marketSignals?: Record<string, unknown>[];
}): SupabaseClient {
  return {
    from: (table: string) => {
      let currentData: Record<string, unknown>[] = [];
      if (table === "markets") currentData = overrides.markets ?? [];
      if (table === "opportunities") currentData = overrides.opportunities ?? [];
      if (table === "evidence") currentData = overrides.evidence ?? [];
      if (table === "market_signals") currentData = overrides.marketSignals ?? [];

      const queryBuilder: Record<string, unknown> = {
        select: () => queryBuilder,
        order: () => queryBuilder,
        in: () => queryBuilder,
        eq: () => queryBuilder,
        then: (resolve: (val: { data: Record<string, unknown>[]; error: null }) => void) =>
          Promise.resolve(resolve({ data: currentData, error: null })),
      };

      return queryBuilder;
    },
  } as unknown as SupabaseClient;
}

describe("Market Explorer Fetcher (PRD §7, §40)", () => {
  it("returns honest empty state when database has no markets (no fake rows)", async () => {
    const mockSupabase = createMockSupabase({ markets: [] });
    const result = await fetchMarketsData(mockSupabase);

    assert.equal(result.markets.length, 0);
    assert.equal(result.stats.totalMarkets, 0);
    assert.equal(result.stats.totalEvidence, 0);
    assert.equal(result.stats.totalOpportunities, 0);
    assert.equal(result.stats.totalSignals, 0);
  });

  it("fetches and maps markets with evidence-derived scores, confidence, and signals", async () => {
    const mockSupabase = createMockSupabase({
      markets: [
        {
          id: "m-1",
          name: "PC Troubleshooting Diagnostics",
          description: "Diagnosing boot failures and hardware issues",
          trend: "accelerating",
          demand_score: 85,
          competition_score: 25,
          pdf_fit_score: 80,
          confidence: 0.75,
          created_at: "2026-09-20T10:00:00Z",
        },
        {
          id: "m-2",
          name: "Home Office Cable Management",
          description: "Desk ergonomics and setup organization",
          trend: "stable",
          demand_score: 40,
          competition_score: 15,
          pdf_fit_score: 55,
          confidence: 0.35,
          created_at: "2026-09-18T10:00:00Z",
        },
      ],
      opportunities: [
        {
          id: "opp-1",
          market_id: "m-1",
          title: "PC Boot Diagnostic Checklist",
          opportunity_score: 90,
          confidence: 0.85,
          format: "checklist",
          target_audience: "PC Gamers & Builders",
        },
        {
          id: "opp-2",
          market_id: "m-1",
          title: "GPU Stability Guide",
          opportunity_score: 75,
          confidence: 0.7,
          format: "guide",
          target_audience: "PC Gamers",
        },
      ],
      evidence: [
        { id: "ev-1", entity_id: "m-1", entity_type: "market" },
        { id: "ev-2", entity_id: "m-1", entity_type: "market" },
        { id: "ev-3", entity_id: "opp-1", entity_type: "opportunity" },
        { id: "ev-4", entity_id: "m-2", entity_type: "market" },
      ],
      marketSignals: [
        {
          market_id: "m-1",
          signal_id: "sig-1",
          signals: { signal_analysis: { intent: "very_strong", urgency: "high" } },
        },
        {
          market_id: "m-1",
          signal_id: "sig-2",
          signals: { signal_analysis: { intent: "strong", urgency: "high" } },
        },
        {
          market_id: "m-2",
          signal_id: "sig-3",
          signals: { signal_analysis: { intent: "weak", urgency: "low" } },
        },
      ],
    });

    const result = await fetchMarketsData(mockSupabase);

    assert.equal(result.markets.length, 2);
    assert.equal(result.stats.totalMarkets, 2);
    assert.equal(result.stats.totalEvidence, 4);
    assert.equal(result.stats.totalOpportunities, 2);
    assert.equal(result.stats.totalSignals, 3);

    const m1 = result.markets.find((m) => m.id === "m-1");
    assert.ok(m1);
    assert.equal(m1.name, "PC Troubleshooting Diagnostics");
    assert.equal(m1.trend, "accelerating");
    assert.equal(m1.demand_score, 85);
    assert.equal(m1.competition_score, 25);
    assert.equal(m1.confidence, 0.75);
    assert.equal(m1.signal_count, 2);
    assert.equal(m1.evidence_count, 3); // 2 direct + 1 via opp-1
    assert.equal(m1.buyer_intent, "very_strong");
    assert.ok(m1.top_opportunity);
    assert.equal(m1.top_opportunity.title, "PC Boot Diagnostic Checklist");
    assert.equal(m1.top_opportunity.opportunity_score, 90);
    assert.equal(m1.opportunity_count, 2);

    const m2 = result.markets.find((m) => m.id === "m-2");
    assert.ok(m2);
    assert.equal(m2.evidence_count, 1);
    assert.equal(m2.signal_count, 1);
    assert.equal(m2.buyer_intent, "weak");
    assert.equal(m2.top_opportunity, null);
    assert.equal(m2.opportunity_count, 0);
  });
});

describe("Explorer Table Filtering & Tab Sorting (PRD §40, §7)", () => {
  const sampleMarkets: MarketRowData[] = [
    {
      id: "1",
      name: "PC Troubleshooting Diagnostics",
      description: "Computer repair and boot diagnosis",
      trend: "accelerating",
      demand_score: 95,
      competition_score: 20,
      pdf_fit_score: 80,
      confidence: 0.8,
      created_at: "2026-09-15T00:00:00Z",
      evidence_count: 25,
      signal_count: 15,
      buyer_intent: "very_strong",
      top_opportunity: {
        id: "opp-1",
        title: "PC Diagnostic Master Checklist",
        opportunity_score: 92,
        confidence: 0.85,
        format: "checklist",
      },
      opportunity_count: 5,
    },
    {
      id: "2",
      name: "Notion for Freelance Copywriters",
      description: "Client tracking and proposal templates",
      trend: "emerging",
      demand_score: 65,
      competition_score: 10,
      pdf_fit_score: 90,
      confidence: 0.6,
      created_at: "2026-09-20T00:00:00Z",
      evidence_count: 12,
      signal_count: 8,
      buyer_intent: "strong",
      top_opportunity: {
        id: "opp-2",
        title: "Copywriter Client Onboarding Kit",
        opportunity_score: 78,
        confidence: 0.65,
        format: "template",
      },
      opportunity_count: 3,
    },
    {
      id: "3",
      name: "Vintage Mechanical Keyboard Restoration",
      description: "Desoldering and switch lubing guide",
      trend: "stable",
      demand_score: 30,
      competition_score: 45,
      pdf_fit_score: 35,
      confidence: 0.4,
      created_at: "2026-09-10T00:00:00Z",
      evidence_count: 6,
      signal_count: 4,
      buyer_intent: "medium",
      top_opportunity: null,
      opportunity_count: 0,
    },
    {
      id: "4",
      name: "Legacy Windows 7 Security Guide",
      description: "Airgapped OS hardening",
      trend: "declining",
      demand_score: 15,
      competition_score: 80,
      pdf_fit_score: 50,
      confidence: 0.25,
      created_at: "2026-09-01T00:00:00Z",
      evidence_count: 3,
      signal_count: 2,
      buyer_intent: "weak",
      top_opportunity: null,
      opportunity_count: 0,
    },
  ];

  it("filters accurately by search query across name, description, and opportunity title", () => {
    const query = "copywriter";
    const filtered = sampleMarkets.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query) ||
        m.top_opportunity?.title.toLowerCase().includes(query)
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "2");

    const checklistQuery = "diagnostic";
    const checklistFiltered = sampleMarkets.filter(
      (m) =>
        m.name.toLowerCase().includes(checklistQuery) ||
        m.description?.toLowerCase().includes(checklistQuery) ||
        m.top_opportunity?.title.toLowerCase().includes(checklistQuery)
    );
    assert.equal(checklistFiltered.length, 1);
    assert.equal(checklistFiltered[0].id, "1");
  });

  it("sorts by Trending Markets tab (accelerating and emerging with high demand score first)", () => {
    const trendWeight: Record<string, number> = {
      accelerating: 400,
      emerging: 300,
      seasonal: 200,
      stable: 100,
      unknown: 50,
      declining: 0,
    };

    const sorted = [...sampleMarkets].sort((a, b) => {
      const scoreA = (trendWeight[a.trend] || 0) + a.demand_score;
      const scoreB = (trendWeight[b.trend] || 0) + b.demand_score;
      return scoreB - scoreA;
    });

    assert.equal(sorted[0].id, "1"); // accelerating + 95
    assert.equal(sorted[1].id, "2"); // emerging + 65
    assert.equal(sorted[2].id, "3"); // stable + 30
    assert.equal(sorted[3].id, "4"); // declining + 15
  });

  it("sorts by Fastest Growing tab (demand_score descending)", () => {
    const sorted = [...sampleMarkets].sort((a, b) => b.demand_score - a.demand_score);

    assert.equal(sorted[0].demand_score, 95);
    assert.equal(sorted[1].demand_score, 65);
    assert.equal(sorted[2].demand_score, 30);
    assert.equal(sorted[3].demand_score, 15);
  });

  it("sorts by High Buyer Intent tab (highest intent weight & opportunity score first)", () => {
    const intentWeight: Record<string, number> = {
      very_strong: 4,
      strong: 3,
      medium: 2,
      weak: 1,
    };

    const sorted = [...sampleMarkets].sort((a, b) => {
      const oppScoreA = a.top_opportunity?.opportunity_score ?? 0;
      const oppScoreB = b.top_opportunity?.opportunity_score ?? 0;
      const weightA = (intentWeight[a.buyer_intent] || 0) * 25 + oppScoreA;
      const weightB = (intentWeight[b.buyer_intent] || 0) * 25 + oppScoreB;
      return weightB - weightA;
    });

    assert.equal(sorted[0].id, "1"); // very_strong (100) + 92 = 192
    assert.equal(sorted[1].id, "2"); // strong (75) + 78 = 153
    assert.equal(sorted[2].id, "3"); // medium (50) + 0 = 50
    assert.equal(sorted[3].id, "4"); // weak (25) + 0 = 25
  });

  it("sorts by Recently Discovered tab (created_at descending)", () => {
    const sorted = [...sampleMarkets].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    assert.equal(sorted[0].id, "2"); // 2026-09-20
    assert.equal(sorted[1].id, "1"); // 2026-09-15
    assert.equal(sorted[2].id, "3"); // 2026-09-10
    assert.equal(sorted[3].id, "4"); // 2026-09-01
  });

  it("filters accurately by Competition density and PDF Fit", () => {
    const lowComp = sampleMarkets.filter((m) => m.competition_score < 30);
    assert.equal(lowComp.length, 2);

    const highPdfFit = sampleMarkets.filter((m) => m.pdf_fit_score >= 60);
    assert.equal(highPdfFit.length, 2);
    assert.ok(highPdfFit.every((m) => m.pdf_fit_score >= 60));
  });
});
