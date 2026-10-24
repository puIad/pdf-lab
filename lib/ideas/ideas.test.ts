// lib/ideas/ideas.test.ts — quick ideas + outline, pure functions, zero network/DB.
// Signals below are SAMPLE DATA shaped like the adapters' normalized output (fixture rule).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adviceFlag,
  buildIdeas,
  isTimely,
  classifyFormat,
  classifyIntent,
  ideaTitle,
  opportunity,
  pdfFit,
  specificity,
  suggestionDemand,
} from "./ideas.ts";
import { headingFrom, suggestOutline } from "./outline.ts";
import { TICK_THRESHOLDS, ideaTicks } from "./ticks.ts";
import type { MarketSignal } from "../sources/types.ts";
import { REGIONS, STARTER_SEEDS, isRegion } from "./seeds.ts";
import { generateScanCsv, parseCsv, recountScanCsv } from "../export/csv.ts";

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

// Part 3.7 — Serper phrase rows (shape of the web adapter's normalize output, SAMPLE DATA).
const serp = (phrase: string, blocks: string, best: number) =>
  sig("web", `serp:us:${phrase}`, { seed: "budgeting", phrase, geo: "us", serp_blocks: blocks, block_count: blocks.split(",").length, blocks_total: 2, best_position: best });

describe("Serper phrases as the production phrase source", () => {
  const result = buildIdeas(
    "budgeting",
    [
      serp("how to budget $3,000 a month?", "paa", 2),
      serp("budgeting planner", "paa,related", 0),
      sig("gtrends", "gt:rq:b", { seed: "budgeting", related_query: "budget planner 2027", interest_value: 300, rising: true }),
      sig("web", "https://example.com/organic", { position: 1 }),
    ],
    new Date("2026-10-24T00:00:00Z"),
  );

  it("cites which blocks returned the phrase (QC Rule 4)", () => {
    const planner = result.ideas.find((i) => i.phrase === "budgeting planner")!;
    assert.equal(planner.demand, suggestionDemand(2, 2, 0));
    assert.equal(planner.demandBasis, "in 2 of 2 Google result blocks (People also ask, Related searches), best position #1");
    assert.deepEqual(planner.engines, ["paa", "related"]);
    const q = result.ideas.find((i) => i.phrase.startsWith("how to budget"))!;
    assert.match(q.demandBasis, /1 of 2 Google result blocks \(People also ask\), best position #3/);
  });

  it("ignores organic result rows and keeps Trends related queries", () => {
    assert.equal(result.ideas.length, 3);
    assert.equal(result.ideas.find((i) => i.phrase === "budget planner 2027")?.trend, "rising");
  });
});

describe("not-professional-advice flag", () => {
  it("flags health, money and legal phrases", () => {
    assert.equal(adviceFlag("keto diet for beginners"), "health");
    assert.equal(adviceFlag("intermittent fasting schedule"), "health");
    assert.equal(adviceFlag("how to pay off credit card debt"), "money");
    assert.equal(adviceFlag("budgeting for students"), "money");
    assert.equal(adviceFlag("what is the 70/20/10 money rule?"), "money");
    assert.equal(adviceFlag("divorce checklist"), "legal");
    assert.equal(adviceFlag("llc operating agreement template"), "legal");
  });
  it("leaves other phrases alone (word boundaries)", () => {
    assert.equal(adviceFlag("packing list for beach vacation"), null);
    assert.equal(adviceFlag("toddler sleep schedule"), null);
    assert.equal(adviceFlag("pursue your hobbies"), null, "'sue' only as a word");
    assert.equal(adviceFlag("lawn care calendar"), null, "'law' only as a word");
  });
});

describe("Timely tag", () => {
  const now = new Date("2026-10-24T00:00:00Z");
  it("marks phrases naming the current or next year", () => {
    assert.equal(isTimely("budget planner 2026", now), true);
    assert.equal(isTimely("2027 wedding planning checklist", now), true);
  });
  it("is not set for past, far-future or non-year numbers", () => {
    assert.equal(isTimely("tax changes 2025", now), false);
    assert.equal(isTimely("vision 2030 planner", now), false);
    assert.equal(isTimely("how to budget $3,000 a month", now), false);
    assert.equal(isTimely("12026 steps", now), false);
  });
  it("never sets a trend label by itself (QC Rule 2)", () => {
    const r = buildIdeas("budget", [serp("budget planner 2027", "related", 1)], now);
    assert.equal(r.ideas[0]?.timely, true);
    assert.equal(r.ideas[0]?.trend, null);
    assert.equal(r.ideas[0]?.advice, "money");
  });
});

describe("regions and starter seeds", () => {
  it("validates region codes", () => {
    assert.ok(isRegion("us") && isRegion("gb"));
    assert.ok(!isRegion("US") && !isRegion("xx") && !isRegion(undefined));
    assert.equal(new Set(REGIONS.map((r) => r.code)).size, REGIONS.length);
  });
  it("holds PDFMakerHub's 21 categories and PDFMinter's 32 seeds, no duplicates", () => {
    assert.equal(STARTER_SEEDS.length, 21);
    const all = STARTER_SEEDS.flatMap((g) => g.seeds);
    assert.equal(new Set(all).size, all.length);
    for (const s of ["keto diet", "budgeting", "toddler sleep", "resume writing", "decluttering", "anxiety relief", "etsy shop", "moving checklist"]) {
      assert.ok(all.includes(s), s);
    }
    assert.ok(all.length >= 32);
  });
});

describe("scan CSV round-trip (2.4 recount)", () => {
  const scan = buildIdeas("keto diet", SIGNALS, new Date("2026-10-24T00:00:00Z"));
  it("recounts rows and evidence ids exactly", () => {
    const csv = generateScanCsv(scan, { region: "us", scannedAt: "2026-10-24T00:00:00.000Z" });
    const r = recountScanCsv(csv, scan);
    assert.deepEqual(r.errors, []);
    assert.equal(r.isRoundTripAccurate, true);
    assert.equal(r.recounted.opportunitiesCount, scan.ideas.length);
    assert.equal(r.recounted.evidenceCount, scan.ideas.reduce((a, i) => a + i.evidence.length, 0));
  });
  it("keeps commas, quotes and line breaks inside fields", () => {
    assert.deepEqual(parseCsv('a,"b, ""c""",d\r\n"x\ny",2\n'), [["a", 'b, "c"', "d"], ["x\ny", "2"]]);
  });
  it("catches a tampered evidence count", () => {
    const csv = generateScanCsv(scan, { region: "us", scannedAt: "t" });
    const lines = csv.split("\n");
    lines.splice(1, 1);
    const r = recountScanCsv(lines.join("\n"), scan);
    assert.equal(r.isRoundTripAccurate, false);
  });
});

describe("card ticks (Part 3.8)", () => {
  const ideas = buildIdeas("keto diet", SIGNALS).ideas;
  const plan = ideas.find((i) => i.phrase === "keto diet plan")!;
  const calc = ideas.find((i) => i.phrase === "keto diet calculator")!;

  it("every tick carries a threshold and a count", () => {
    const ticks = ideaTicks(plan);
    assert.deepEqual(ticks.map((t) => t.key), ["demand", "trend", "fit", "effort", "competition"]);
    assert.ok(ticks.every((t) => t.threshold.length > 0 && t.count.length > 0));
  });

  it("demand and fit compare against their thresholds", () => {
    const t = Object.fromEntries(ideaTicks(plan).map((x) => [x.key, x]));
    assert.equal(t.demand.status, plan.demand >= TICK_THRESHOLDS.demand ? "pass" : "fail");
    assert.equal(t.trend.status, "pass"); // breakout in Trends
    const c = Object.fromEntries(ideaTicks(calc).map((x) => [x.key, x]));
    assert.equal(c.fit.status, "fail"); // tool search: fit < 60
    assert.equal(c.trend.status, "blank"); // not observed is not a failure (QC Rule 2)
  });

  it("competition stays blank until a check has run (QC Rule 3)", () => {
    assert.equal(ideaTicks(plan).at(-1)!.status, "blank");
    assert.equal(ideaTicks(plan, { listings: 12 }).at(-1)!.status, "pass");
    assert.equal(ideaTicks(plan, { listings: 80 }).at(-1)!.status, "fail");
  });

  it("Hard formats fail the effort tick", () => {
    const hard = { ...plan, effort: "Hard" as const };
    assert.equal(ideaTicks(hard).find((t) => t.key === "effort")!.status, "fail");
  });
});
