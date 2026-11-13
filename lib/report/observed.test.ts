// lib/report/observed.test.ts — Part 6.14: report pages show stored values or "Not observed".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { marketCompletenessCounts, observeMarket, platformCounts } from "./observed.ts";

const signal = (type: string, analysis?: { audience?: string; problem?: string; urgency?: string; pdf_relevance?: number }) => ({
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
