// lib/ideas/ideas.test.ts — quick ideas + outline, pure functions, zero network/DB.
// Signals below are SAMPLE DATA shaped like the adapters' normalized output (fixture rule).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildIdeas,
  classifyFormat,
  classifyIntent,
  ideaTitle,
  opportunity,
  pdfFit,
  specificity,
  suggestionDemand,
} from "./ideas.ts";
import { headingFrom, suggestOutline } from "./outline.ts";
import type { MarketSignal } from "../sources/types.ts";

function sig(source: string, id: string, engagement: MarketSignal["engagement"]): MarketSignal {
  return {
    source,
    source_id: id,
    url: `https://example.com/${id}`,
    title: id,
    text: null,
    author: "anonymous",
    timestamp: null,
    engagement,
    market_candidates: [],
    intent: null,
    pain_points: [],
  };
}

const suggestion = (phrase: string, engines: string, best: number) =>
  sig("autocomplete", `ac:${phrase}`, { seed: "keto diet", phrase, engines, engine_count: engines.split(",").length, engines_ok: 5, best_position: best });

const SIGNALS: MarketSignal[] = [
  suggestion("keto diet plan", "google,youtube,bing,ddg,amazon", 0),
  suggestion("keto diet food list", "google,bing", 2),
  suggestion("what is keto diet", "google,bing,ddg", 1),
  suggestion("keto diet calculator", "google,bing,ddg", 0),
  sig("gtrends", "gt:rq:1", { seed: "keto diet", related_query: "metabolic psychiatry keto diet", interest_value: 850, rising: true }),
  sig("gtrends", "gt:rq:2", { seed: "keto diet", related_query: "keto diet plan", interest_value: 6000, rising: true }),
  sig("wikipedia", "wiki:pv", { seed: "keto diet", article: "Ketogenic diet", recent_daily_avg: 150, prior_daily_avg: 100, recent_days: 28, prior_days: 56, change_pct: 50, direction: "rising" }),
];

describe("classification", () => {
  it("picks a format from the phrase", () => {
    assert.equal(classifyFormat("keto diet food list"), "Checklist");
    assert.equal(classifyFormat("keto diet plan for weight loss"), "Planner");
    assert.equal(classifyFormat("budgeting template excel"), "Worksheet");
    assert.equal(classifyFormat("keto diet recipes"), "Ebook");
    assert.equal(classifyFormat("what is keto diet"), "Guide");
  });

  it("reads intent, fit and specificity", () => {
    assert.equal(classifyIntent("how to start keto diet", []), "howto");
    assert.equal(classifyIntent("keto vs paleo", []), "compare");
    assert.equal(classifyIntent("best keto diet book", []), "buyer");
    assert.equal(classifyIntent("keto diet snacks", ["amazon"]), "buyer");
    assert.equal(classifyIntent("is keto diet safe", []), "question");
    assert.ok(pdfFit("keto diet calculator", "Guide", "info") < pdfFit("keto diet food list", "Checklist", "info"));
    assert.equal(specificity("keto diet plan", "keto diet"), "broad");
    assert.equal(specificity("keto diet plan for women over 50", "keto diet"), "long_tail");
    assert.equal(specificity("is keto diet safe", "keto diet"), "long_tail");
  });

  it("writes titles without doubling the format word", () => {
    assert.equal(ideaTitle("keto diet checklist", "Checklist", "info"), "The Keto Diet Checklist");
    assert.equal(ideaTitle("how to start keto", "Guide", "howto"), "How to Start Keto: A Step-by-Step Guide");
    assert.equal(ideaTitle("what is keto diet", "Guide", "question"), "What is keto diet? A Plain-English Guide");
    assert.equal(ideaTitle("budgeting for beginners worksheets", "Worksheet", "info"), "The Budgeting for Beginners Worksheets");
    assert.equal(ideaTitle("budgeting for beginners book", "Ebook", "buyer"), "Budgeting for Beginners: The Complete Handbook");
    assert.equal(ideaTitle("best budgeting tools", "Guide", "buyer"), "Best Budgeting Tools: A Buyer's Guide");
  });

  it("scores demand from engine share and position", () => {
    assert.equal(suggestionDemand(5, 5, 0), 100);
    assert.equal(suggestionDemand(1, 5, 9), 17);
    assert.equal(suggestionDemand(2, 0, 0), 30, "no answering engines → share 0");
    assert.equal(opportunity(80, 60, "rising"), 81);
    assert.equal(opportunity(100, 100, "breakout"), 100);
  });
});

describe("buildIdeas", () => {
  const result = buildIdeas("Keto Diet", SIGNALS);
  const byPhrase = new Map(result.ideas.map((i) => [i.phrase, i]));

  it("merges suggestion and Trends evidence for the same phrase", () => {
    const plan = byPhrase.get("keto diet plan");
    assert.ok(plan);
    assert.equal(plan.demand, 100);
    assert.equal(plan.trend, "breakout");
    assert.equal(plan.evidence.length, 2);
    assert.match(plan.demandBasis, /5 of 5 engines/);
    assert.equal(plan.confidence, 1);
    assert.equal(byPhrase.get("keto diet food list")?.confidence, 0.4);
  });

  it("labels trend only when Trends shows it rising (QC Rule 2)", () => {
    assert.equal(byPhrase.get("keto diet food list")?.trend, null);
    assert.equal(byPhrase.get("keto diet food list")?.trendBasis, null);
    const rising = byPhrase.get("metabolic psychiatry keto diet");
    assert.equal(rising?.trend, "rising");
    assert.equal(rising?.demand, 0, "no suggestion evidence → no invented demand");
    assert.match(rising?.demandBasis ?? "", /not observed/);
  });

  it("ranks by opportunity and reports the topic line with both windows", () => {
    assert.equal(result.ideas[0].phrase, "keto diet plan");
    assert.equal(result.stats.ideas, 5);
    assert.equal(result.stats.rising, 2);
    assert.equal(result.topic.length, 1);
    assert.match(result.topic[0].basis, /150\/day over the last 28 days vs 100\/day over the prior 56/);
  });
});

describe("suggestOutline", () => {
  const related = [
    { phrase: "what is keto diet", opportunity: 70 },
    { phrase: "keto diet food list", opportunity: 65 },
    { phrase: "keto diet foods list", opportunity: 64 }, // near-duplicate of the one above
    { phrase: "keto diet for beginners", opportunity: 60 },
    { phrase: "how to start keto diet", opportunity: 55 },
  ];

  it("ranks related phrases, drops near-duplicates and pads with defaults", () => {
    const out = suggestOutline({ phrase: "keto diet plan", format: "Guide", related });
    assert.equal(out.length, 6);
    assert.equal(out.filter((h) => /food/i.test(h)).length, 1, "near-duplicate dropped");
    assert.ok(out.includes("What is keto diet?"));
    assert.ok(out.includes("How To Start Keto Diet"));
    assert.ok(out.includes("Keto Diet For Beginners"));
    assert.deepEqual(out.slice(4), ["Why keto diet plan matters", "What you need before you start"], "padded from defaults");
  });

  it("rotates on offset and respects the format's section count", () => {
    const a = suggestOutline({ phrase: "keto diet plan", format: "Checklist", related });
    const b = suggestOutline({ phrase: "keto diet plan", format: "Checklist", related, offset: 1 });
    assert.equal(a.length, 4);
    assert.notDeepEqual(a, b);
    assert.equal(headingFrom("is keto safe?"), "Is keto safe?");
  });
});
