// lib/report/observed.test.ts — Part 6.14: report pages show stored values or "Not observed".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { intentUrgencyLines, marketCompletenessCounts, marketQcRules, observeMarket, platformCounts } from "./observed.ts";
import { INTENT_VALUES } from "../ai/extraction.ts";
import { calculateCompleteness } from "../runs/completeness.ts";

const signal = (type: string, analysis?: { audience?: string; problem?: string; intent?: string; urgency?: string; pdf_relevance?: number }) => ({
  sources: { type },
  signal_analysis: analysis ? [analysis] : [],
});

test("observeMarket counts what is stored and nothing else", () => {
  const o = observeMarket([
    signal("reddit", { audience: "couples", problem: "Overspending on groceries", urgency: "high", pdf_relevance: 0.8 }),
    signal("reddit", { audience: "parents", problem: "overspending on groceries", urgency: "medium", pdf_relevance: 0.6 }),
    signal("web", { audience: "students", problem: "Rent takes the whole budget", urgency: "soon" }),
    signal("gtrends"),
  ]);
  assert.equal(o.totalSignals, 4);
  assert.equal(o.analysedSignals, 3);
  assert.deepEqual(o.sources, ["gtrends", "reddit", "web"]);
  assert.deepEqual(o.problems, [
    { problem: "Overspending on groceries", audience: "couples", count: 2 },
    { problem: "Rent takes the whole budget", audience: "students", count: 1 },
  ]);
  assert.deepEqual(o.urgency, { high: 1, medium: 1, low: 0 }); // an unknown label is not counted
  assert.equal(o.avgPdfRelevance, 0.7);
});

test("an empty or unanalysed market reads as empty: no floors, no defaults", () => {
  const empty = observeMarket([]);
  assert.deepEqual(
    [empty.totalSignals, empty.analysedSignals, empty.sources.length, empty.problems.length, empty.avgPdfRelevance],
    [0, 0, 0, 0, null],
  );
  const counts = marketCompletenessCounts({ observations: observeMarket([signal("reddit")]), opportunityIds: [], evidence: [] });
  assert.deepEqual(counts, {
    sourcesCovered: 1,
    signalsCollected: 1,
    signalsAnalyzed: 0,
    marketsIdentified: 1,
    opportunitiesGenerated: 0,
    evidenceCount: 0,
    evidenceBackedOpportunitiesCount: 0,
  });
});

test("an opportunity counts as backed only by its own evidence rows", () => {
  const counts = marketCompletenessCounts({
    observations: observeMarket([]),
    opportunityIds: ["o1", "o2"],
    evidence: [
      { entity_type: "opportunity", entity_id: "o1" },
      { entity_type: "opportunity", entity_id: "o1" },
      { entity_type: "market", entity_id: "m1" },
      { entity_type: "opportunity", entity_id: "another-market-opp" },
    ],
  });
  assert.equal(counts.evidenceCount, 4);
  assert.equal(counts.evidenceBackedOpportunitiesCount, 1);
});

test("platformCounts groups stored competitor rows", () => {
  assert.deepEqual(platformCounts([{ platform: "etsy" }, { platform: "etsy" }, { platform: "gumroad" }, { platform: null }]), [
    { platform: "etsy", count: 2 },
    { platform: "gumroad", count: 1 },
    { platform: "unknown", count: 1 },
  ]);
});

test("report sources carry no fixed niche copy, default scores or count floors", () => {
  const files = [
    "app/opportunities/[id]/page.tsx",
    "app/markets/[id]/page.tsx",
    "lib/export/fetcher.ts",
    "components/evidence/facts-interpretation-suggestion.tsx",
    "components/quality-panel/quality-panel.tsx",
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(src, /\bPC\b|BIOS|hardware|repair shop|troubleshoot|Powercfg|\$\d+ Value/i, `${file} has niche copy`);
    assert.doesNotMatch(src, /Math\.max\([^)]*\b25\b|marketsIdentified: 14|\|\| 7[05]\b|\?\? 0\.75|\|\| 0\.5\b/, `${file} has a floor or default`);
  }
});

test("QC rules are results on the market's stored rows (#52)", () => {
  const dated = { published_at: "2026-10-01", sources: { type: "reddit" } };
  const ev = (entity_type: string, entity_id: string, sourced = true) => ({
    entity_type,
    entity_id,
    source_id: sourced ? "s1" : null,
    url: "https://example.com/p",
    excerpt: null,
  });
  const rules = marketQcRules({
    market: { trend: "accelerating", demand_score: 40, competition_score: 55 },
    signals: [dated, { sources: { type: "web" }, signal_analysis: [{ problem: "x" }] }],
    competitorCount: 0,
    opportunityIds: ["o1", "o2"],
    evidence: [ev("opportunity", "o1"), ev("opportunity", "o2", false), ev("market", "m1")],
  });
  assert.deepEqual(
    rules.map((r) => [r.rule, r.held, r.text]),
    [
      [1, false, "1 of 2 opportunities have a sourced evidence row"],
      [2, false, 'Trend "accelerating" from 1 dated observation, 2 needed'],
      [3, false, "Competition score 55 with no stored listing"],
      [4, true, "Demand 40 from 2 linked signals"],
      [5, true, "3 citations, 1 analysed signal, 2 suggestions stored apart"],
    ],
  );

  // An empty market claims nothing: the rules hold or have nothing to check.
  const empty = marketQcRules({
    market: { trend: null, demand_score: null, competition_score: null },
    signals: [],
    competitorCount: 0,
    opportunityIds: [],
    evidence: [],
  });
  assert.deepEqual(
    empty.map((r) => r.held),
    [null, true, true, null, null],
  );
  // A Google Trends row is a dated observation.
  const trends = marketQcRules({
    market: { trend: "stable", demand_score: 10, competition_score: null },
    signals: [{ sources: { type: "gtrends" } }, dated],
    competitorCount: 3,
    opportunityIds: [],
    evidence: [],
  });
  assert.deepEqual([trends[1].held, trends[2].text], [true, "Competition from 3 stored listings"]);
  // Interpretations with no citation under them break the separation.
  assert.deepEqual(
    [trends[4].held, marketQcRules({
      market: { trend: null, demand_score: null, competition_score: null },
      signals: [{ signal_analysis: [{ problem: "x" }] }],
      competitorCount: 0,
      opportunityIds: [],
      evidence: [],
    })[4]],
    [null, { rule: 5, held: false, text: "0 citations, 1 analysed signal, 0 suggestions stored apart, with no facts layer" }],
  );
});

test("a market page's 15% completeness slot is the share of checked rules that hold", () => {
  const base = { observations: observeMarket([]), opportunityIds: [], evidence: [] };
  const rule = (held: boolean | null) => ({ rule: 2 as const, held, text: "" });
  const counts = marketCompletenessCounts({ ...base, rules: [rule(true), rule(false), rule(null), rule(true)] });
  assert.equal(counts.qcRulesChecked, 3);
  assert.equal(counts.qcRulesHeld, 2);
  assert.equal(calculateCompleteness(counts).completenessPercentage, 10); // 2/3 of 15
  // Before #52 any market page got the 15 points.
  assert.equal(calculateCompleteness(marketCompletenessCounts(base)).completenessPercentage, 15);
  assert.equal(calculateCompleteness(marketCompletenessCounts({ ...base, rules: [rule(false)] })).completenessPercentage, 0);
});

test("intentUrgencyLines states the strongest stored level and its count, and Not observed for phrase-only rows", () => {
  const o = observeMarket([
    signal("reddit", { intent: "very_strong", urgency: "high" }),
    signal("reddit", { intent: "weak", urgency: "low" }),
    signal("web", { intent: "weak", urgency: "low" }),
    signal("web"),
  ]);
  assert.deepEqual(o.intent, { very_strong: 1, strong: 0, medium: 0, weak: 2 });
  assert.deepEqual(intentUrgencyLines(o), {
    intent: "Very strong, 1 of 3 analysed signals",
    urgency: "High, 1 of 3 analysed signals",
  });
  assert.deepEqual(intentUrgencyLines(observeMarket([signal("gtrends"), signal("gtrends")])), {
    intent: "Not observed",
    urgency: "Not observed",
  });
});

test("observeMarket counts every buyer-intent level extraction can store", () => {
  const o = observeMarket(INTENT_VALUES.map((intent) => signal("reddit", { intent })));
  assert.deepEqual(Object.keys(o.intent).sort(), [...INTENT_VALUES].sort());
  assert.ok(Object.values(o.intent).every((n) => n === 1));
});
