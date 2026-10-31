// lib/planner/planner.test.ts — PRD §26 probe questions → plans; Hunt filter; Validate (PRD §48) blocks.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planResearch, searchTextOf, seedOf } from "./parse.ts";
import { buildValidationReport, filterMarkets, VALIDATION_BLOCKS } from "./modes.ts";
import { PLANNER_PROMPT_VERSION } from "./types.ts";
import { buildVerdict } from "./verdict.ts";
import { createEmptyOverview } from "../search/overview.ts";
import type { MarketRowData } from "../markets/types.ts";
import type { MarketOverview } from "../search/types.ts";

describe("planResearch — PRD §26 example questions", () => {
  test("'PDF markets for busy parents' → explore scoped to the audience", () => {
    const p = planResearch("PDF markets for busy parents");
    assert.equal(p.mode, "explore");
    assert.equal(p.query.audience, "busy parents");
    assert.equal(p.query.niche, "");
    assert.equal(searchTextOf(p.query), "busy parents");
  });

  test("'high intent + low competition' → hunt with both filters, no niche", () => {
    const p = planResearch("high intent + low competition");
    assert.equal(p.mode, "hunt");
    assert.equal(p.query.intent, "high");
    assert.equal(p.query.competition, "low");
    assert.equal(p.query.niche, "");
    assert.equal(p.query.audience, null);
  });

  test("'problems asking for templates' → hunt on template format, not an audience", () => {
    const p = planResearch("problems asking for templates");
    assert.equal(p.mode, "hunt");
    assert.deepEqual(p.query.formats, ["template"]);
    assert.equal(p.query.audience, null);
    assert.equal(p.query.niche, "");
  });

  test("seasonal horizon question → hunt, seasonal, 60 days", () => {
    const p = planResearch("markets likely to surge in the next 60 days");
    assert.equal(p.mode, "hunt");
    assert.equal(p.query.trend, "seasonal");
    assert.equal(p.query.horizonDays, 60);
  });
});

describe("planResearch — modes (PRD §27–§28)", () => {
  test("`pdf-lab <niche>` signature → deep with the niche verbatim", () => {
    const p = planResearch("pdf-lab pc troubleshooting");
    assert.equal(p.mode, "deep");
    assert.equal(p.modeSource, "signature");
    assert.equal(p.query.niche, "pc troubleshooting");
    assert.equal(p.depth.ingests, true);
    assert.equal(p.depth.steps[0], "25 opportunities");
  });

  test("explicit prefix wins over inference", () => {
    const p = planResearch("monitor: pc troubleshooting");
    assert.equal(p.mode, "monitor");
    assert.equal(p.modeSource, "explicit");
    assert.equal(p.query.niche, "pc troubleshooting");
  });

  test("validate keeps the user's exact concept (no invented alternatives)", () => {
    const p = planResearch("Would people buy a Notion template for freelancers?");
    assert.equal(p.mode, "validate");
    assert.equal(p.query.concept, "a Notion template for freelancers");
    assert.equal(p.query.audience, "freelancers");
  });

  test("forced mode from UI picker overrides inference", () => {
    const p = planResearch("pc troubleshooting", "validate");
    assert.equal(p.mode, "validate");
    assert.equal(p.query.concept, "pc troubleshooting");
  });

  test("plain niche → explore; every plan carries the rule-set version", () => {
    const p = planResearch("pc troubleshooting");
    assert.equal(p.mode, "explore");
    assert.equal(p.query.niche, "pc troubleshooting");
    assert.equal(p.promptVersion, PLANNER_PROMPT_VERSION);
  });

  test("'tracker' format does not trigger monitor mode", () => {
    assert.equal(planResearch("habit tracker for students").mode, "hunt");
  });
});

function market(over: Partial<MarketRowData>): MarketRowData {
  return {
    id: "m",
    name: "Market",
    description: null,
    trend: "stable",
    demand_score: 50,
    competition_score: 50,
    pdf_fit_score: 70,
    confidence: 0.5,
    created_at: "2026-09-20T00:00:00Z",
    evidence_count: 3,
    signal_count: 4,
    buyer_intent: "medium",
    top_opportunity: null,
    opportunity_count: 0,
    ...over,
  };
}

describe("filterMarkets (Hunt/Explore)", () => {
  const rows = [
    market({ id: "a", name: "Parent meal planning", buyer_intent: "strong", competition_score: 20, demand_score: 60 }),
    market({ id: "b", name: "Parent budgeting", buyer_intent: "strong", competition_score: 80 }),
    market({ id: "c", name: "Resume templates", buyer_intent: "very_strong", competition_score: 10, signal_count: 0 }),
    market({ id: "d", name: "Parent sleep", evidence_count: 0, buyer_intent: "strong", competition_score: 5 }),
  ];

  test("high intent + low competition keeps only evidence-backed, signal-backed matches", () => {
    const res = filterMarkets(rows, planResearch("high intent + low competition").query);
    assert.deepEqual(res.map((r) => r.market.id), ["a"]);
    assert.match(res[0].matched.join(" "), /4 signals/);
    assert.match(res[0].matched.join(" "), /competition 20\/100/);
  });

  test("format filter matches market text", () => {
    const res = filterMarkets(rows, planResearch("problems asking for templates").query);
    assert.deepEqual(res.map((r) => r.market.id), ["c"]);
  });

  test("audience text filter excludes evidence-less markets", () => {
    const res = filterMarkets(rows, planResearch("PDF markets for busy parents").query);
    assert.deepEqual(res.map((r) => r.market.id).sort(), ["a", "b"]);
  });
});

describe("buildValidationReport (PRD §48)", () => {
  test("empty evidence → every block honest, risks derived from zero counts", () => {
    const ov = createEmptyOverview("x", "validate", new Date().toISOString());
    const r = buildValidationReport("x", ov);
    assert.deepEqual(Object.keys(r.blocks), [...VALIDATION_BLOCKS]);
    for (const k of VALIDATION_BLOCKS.filter((k) => k !== "risks")) {
      assert.equal(r.blocks[k].observed, false, k);
      assert.equal(r.blocks[k].items.length, 0, k);
    }
    const riskText = r.blocks.risks.items.map((i) => i.text).join(" ");
    assert.match(riskText, /Thin evidence: only 0/);
    assert.match(riskText, /QC Rule 2/);
    assert.match(riskText, /willingness to pay is unproven/);
  });

  test("observed data flows into blocks with citations", () => {
    const ov: MarketOverview = {
      ...createEmptyOverview("pc", "validate", new Date().toISOString()),
      matchedSignalsCount: 12,
      discussionCounts: {
        observed: true,
        value: { total: 12, bySource: { reddit: 9, web: 3 } },
        rawLabel: "12",
        evidence: [{ id: "e1", url: "https://r/1" }],
      },
      pains: {
        observed: true,
        value: {
          items: [
            {
              problem: "PC will not boot",
              frequency: 5,
              audience: "gamers",
              urgency: "high",
              citations: [{ id: "e2", url: "https://r/2" }],
            },
          ],
        },
        rawLabel: "1",
        evidence: [],
      },
      marketplaceActivity: {
        observed: true,
        value: {
          productsCount: 2,
          platforms: { etsy: 2 },
          priceRange: "$5–$12",
          sampleProducts: [{ title: "Boot guide", platform: "etsy", price: "$5", url: "https://etsy/1" }],
        },
        rawLabel: "2",
        evidence: [],
      },
    };
    const r = buildValidationReport("pc boot guide", ov);
    assert.equal(r.blocks.demand.observed, true);
    assert.match(r.blocks.demand.summary, /12 discussions across 2 sources/);
    assert.equal(r.blocks.demand.items[0].citations[0].url, "https://r/1");
    assert.equal(r.blocks.audience.items[0].text, "gamers — 5 pain signals");
    assert.equal(r.blocks.complaints.items[0].citations[0].url, "https://r/2");
    assert.match(r.blocks.pricing.summary, /\$5–\$12/);
    assert.equal(r.blocks.products.items[0].citations[0].url, "https://etsy/1");
    assert.doesNotMatch(r.blocks.risks.items.map((i) => i.text).join(" "), /Thin evidence/);
  });
});

describe("buildVerdict (Part 3.8)", () => {
  const metric = <T>(value: T) => ({ observed: true, value, rawLabel: "", evidence: [] });
  function ov(discussions: number, strong: number, intentTotal: number, competitors: number, direction: "stable" | "declining" | "unknown", windows: number): MarketOverview {
    return {
      ...createEmptyOverview("x", "validate", new Date().toISOString()),
      discussionCounts: metric({ total: discussions, bySource: { reddit: discussions } }),
      buyerIntentSignals: metric({ totalIntentSignals: intentTotal, veryStrongCount: 0, strongCount: strong, mediumCount: 0, weakCount: intentTotal - strong, sampleQuotes: [] }),
      competitiveDensity: metric({ densityRating: "moderate" as const, score: 40, competitorsObserved: competitors }),
      trendDirection: metric({ direction, timeWindowsEvaluated: windows, historicalSignalsCount: 10 }),
    };
  }
  const status = (v: ReturnType<typeof buildVerdict>, key: string) => v.checks.find((c) => c.key === key)!.status;

  test("GO: demand and intent pass, nothing fails; every check shows its count and threshold", () => {
    const v = buildVerdict(ov(12, 4, 10, 5, "stable", 3));
    assert.equal(v.verdict, "GO");
    assert.ok(v.checks.every((c) => c.count && c.threshold));
    assert.equal(v.checks[0].count, "12 discussions");
    assert.match(v.checks[1].count, /4 of 10 analyzed strong \(40%\)/);
  });

  test("intent: wording-only matches are left out, and a tiny sample cannot pass", () => {
    const base = ov(12, 4, 10, 5, "stable", 3);
    const bi = base.buyerIntentSignals.value!;
    base.buyerIntentSignals = metric({ ...bi, strongCount: 8, totalIntentSignals: 14, wordingOnlyCount: 4 });
    assert.match(buildVerdict(base).checks[1].count, /4 of 10 analyzed/);
    const tiny = buildVerdict(ov(12, 1, 1, 5, "stable", 3));
    assert.equal(status(tiny, "intent"), "weak"); // 100% of 1 is not proof
    assert.equal(tiny.verdict, "WAIT");
  });

  test("KILL: demand below the floor regardless of the rest", () => {
    const v = buildVerdict(ov(2, 2, 2, 5, "stable", 3));
    assert.equal(v.verdict, "KILL");
    assert.match(v.reason, /Only 2 discussions/);
  });

  test("KILL: two failed checks (crowded and declining)", () => {
    const v = buildVerdict(ov(12, 4, 10, 45, "declining", 3));
    assert.equal(status(v, "competition"), "fail");
    assert.equal(status(v, "trend"), "fail");
    assert.equal(v.verdict, "KILL");
  });

  test("WAIT: unobserved counts never pass (QC Rules 2–3)", () => {
    const v = buildVerdict(ov(5, 0, 0, 0, "unknown", 0));
    assert.equal(status(v, "demand"), "weak");
    assert.equal(status(v, "intent"), "not_observed");
    assert.equal(status(v, "competition"), "not_observed");
    assert.equal(status(v, "trend"), "not_observed");
    assert.equal(v.verdict, "WAIT");
  });

  test("empty overview → KILL on zero demand", () => {
    assert.equal(buildVerdict(createEmptyOverview("x", "validate", new Date().toISOString())).verdict, "KILL");
  });
});

describe("seedOf (Part 3.8 review)", () => {
  test("keeps the typed seed that searchTextOf would rewrite", () => {
    assert.equal(seedOf("strength training for women"), "strength training for women");
    assert.notEqual(searchTextOf(planResearch("strength training for women", "deep").query), "strength training for women");
    assert.equal(seedOf("pdf-lab Moving Checklist"), "moving checklist");
    assert.equal(seedOf("deep: packing list"), "packing list");
  });
});
