// lib/scoring/scoring.test.ts — Unit tests for market scoring and PDF suitability.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { demandFromSignals, scoreMarket } from "./scoring.ts";
import { evaluatePdfSuitability } from "./pdf-suitability.ts";
import type { SignalScoringItem } from "./scoring.ts";

describe("evaluatePdfSuitability (PRD §17)", () => {
  it("rates high suitability for checklists, guides, and diagnostic workflows", () => {
    const res1 = evaluatePdfSuitability({
      problem: "User needs a step-by-step diagnostic checklist for PC boot failure",
      audience: "first-time PC builders",
      extractedRelevance: 0.85,
    });
    assert.equal(res1.isSuitable, true);
    assert.ok(res1.score >= 0.7);
    assert.ok(res1.recommendedFormats.includes("checklist") || res1.recommendedFormats.includes("guide"));

    const res2 = evaluatePdfSuitability({
      problem: "BIOS setting reference guide and error code cheatsheet",
      audience: "PC gamers",
    });
    assert.equal(res2.isSuitable, true);
    assert.ok(res2.recommendedFormats.includes("cheat_sheet"));
  });

  it("penalizes physical repair, real-time overlays, and in-person services", () => {
    const res1 = evaluatePdfSuitability({
      problem: "Motherboard capacitor replacement requiring micro-solder tools",
      audience: "electronics repairers",
      extractedRelevance: 0.1,
    });
    assert.equal(res1.isSuitable, false);
    assert.ok(res1.score < 0.4);
    assert.ok(res1.reasons.some((r) => r.toLowerCase().includes("solder")));

    const res2 = evaluatePdfSuitability({
      problem: "Real-time in-game FPS counter and GPU overlay software",
      audience: "gamers",
      extractedRelevance: 0.15,
    });
    assert.equal(res2.isSuitable, false);
    assert.ok(res2.score < 0.4);
  });
});

describe("scoreMarket (05-PIPELINE-SCORING)", () => {
  it("returns zero score and confidence when signals array is empty", () => {
    const res = scoreMarket([]);
    assert.equal(res.score, 0);
    assert.equal(res.confidence, 0);
    assert.equal(res.evidenceCount, 0);
  });

  it("enforces low confidence (< 0.50) when data is thin (PRD §54)", () => {
    const thinSignals: SignalScoringItem[] = [
      {
        signalId: "s1",
        sourceType: "reddit",
        title: "PC boot issue",
        analysis: { intent: "weak", pdf_relevance: 0.5, problem: "boot issue" },
      },
      {
        signalId: "s2",
        sourceType: "reddit",
        title: "PC won't start",
        analysis: { intent: "medium", pdf_relevance: 0.6, problem: "power issue" },
      },
    ];
    const res = scoreMarket(thinSignals);
    assert.equal(res.evidenceCount, 2);
    assert.ok(res.confidence <= 0.35, `expected confidence <= 0.35 for <3 signals, got ${res.confidence}`);
  });

  it("caps confidence at 0.50 when only a single source is present", () => {
    const singleSourceSignals: SignalScoringItem[] = Array.from({ length: 8 }, (_, i) => ({
      signalId: `s-${i}`,
      sourceType: "reddit",
      title: `PC issue ${i}`,
      analysis: { intent: "strong", pdf_relevance: 0.8, problem: `problem ${i}` },
    }));
    const res = scoreMarket(singleSourceSignals);
    assert.equal(res.evidenceCount, 8);
    assert.ok(res.confidence <= 0.5, `expected confidence <= 0.50 for single source, got ${res.confidence}`);
  });

  it("monotonically increases score and confidence as evidence expands", () => {
    const baseSignals: SignalScoringItem[] = [
      {
        signalId: "s1",
        sourceType: "reddit",
        title: "PC BSOD crash",
        analysis: { intent: "strong", pdf_relevance: 0.8, problem: "BSOD stop code crash" },
      },
      {
        signalId: "s2",
        sourceType: "reddit",
        title: "BSOD after update",
        analysis: { intent: "strong", pdf_relevance: 0.8, problem: "Driver crash BSOD" },
      },
      {
        signalId: "s3",
        sourceType: "reddit",
        title: "Need BSOD fix guide",
        analysis: { intent: "strong", pdf_relevance: 0.85, problem: "Windows crash dump" },
      },
    ];

    const res1 = scoreMarket(baseSignals);

    // Expand with more signals and multi-source diversity (web + gtrends)
    const expandedSignals: SignalScoringItem[] = [
      ...baseSignals,
      {
        signalId: "s4",
        sourceType: "web",
        title: "How to fix BSOD guide",
        analysis: { intent: "strong", pdf_relevance: 0.9, problem: "BSOD troubleshooting guide" },
      },
      {
        signalId: "s5",
        sourceType: "web",
        title: "Windows BSOD checklist",
        analysis: { intent: "very_strong", pdf_relevance: 0.95, problem: "BSOD repair checklist" },
      },
      {
        signalId: "s6",
        sourceType: "gtrends",
        title: "bsod troubleshooting",
        analysis: { intent: "strong", pdf_relevance: 0.85, problem: "Rising searches for BSOD" },
      },
      {
        signalId: "s7",
        sourceType: "gtrends",
        title: "pc crash fix",
        analysis: { intent: "strong", pdf_relevance: 0.85, problem: "Crash fix searches" },
      },
    ];

    const res2 = scoreMarket(expandedSignals);

    // Score and confidence must both increase with more evidence and sources
    assert.ok(
      res2.score > res1.score,
      `score should increase monotonically: ${res2.score} > ${res1.score}`,
    );
    assert.ok(
      res2.confidence > res1.confidence,
      `confidence should increase monotonically: ${res2.confidence} > ${res1.confidence}`,
    );
    assert.ok(res2.evidenceCount > res1.evidenceCount);
  });
});

describe("score honesty (Part 6.11)", () => {
  const reddit = (i: number, upvotes: number, intent?: string): SignalScoringItem => ({
    signalId: `r${i}`,
    sourceType: "reddit",
    title: i % 3 === 0 ? `how do I stick to a budget ${i}` : `budget thread ${i}`,
    engagement: { upvotes, comments: Math.round(upvotes / 4), upvote_ratio: 0.97 },
    analysis: intent ? { intent, problem: "cannot stick to a budget", pdf_relevance: 0.7 } : null,
  });
  const trends = (i: number, value: number, rising = false): SignalScoringItem => ({
    signalId: `g${i}`,
    sourceType: "gtrends",
    title: `Related query: "budget ${i}"`,
    engagement: { interest_value: value, rising, window_days: 90 },
    analysis: null,
  });
  const web = (i: number): SignalScoringItem => ({
    signalId: `w${i}`,
    sourceType: "web",
    title: `what is zero based budgeting ${i}`,
    engagement: { position: i + 1 },
    analysis: null,
  });
  // The first 25 are what a limit-25 ingest returns; the other 25 are the lower-ranked rows limit 50 adds.
  const ranked = (n: number): SignalScoringItem[] =>
    Array.from({ length: n }, (_, i) =>
      i % 5 === 3 ? trends(i, Math.max(5, 100 - 2 * i)) : i % 5 === 4 ? web(i) : reddit(i, Math.max(3, 240 - 4 * i), "strong"),
    );

  it("doubling the ingest limit moves the demand score by less than 10 percent", () => {
    const half = demandFromSignals(ranked(25)).demand;
    const full = demandFromSignals(ranked(50)).demand;
    assert.ok(half > 0);
    assert.ok(Math.abs(full - half) / half < 0.1, `demand ${half} at limit 25, ${full} at limit 50`);
    // The old formula read 70 + engagement for both: it measured the limit, not the market.
    assert.notEqual(half, 100);
  });

  it("reads only the engagement keys named for the source", () => {
    const { basis } = demandFromSignals([reddit(1, 100), web(2), trends(3, 60), trends(4, 5000, true)]);
    assert.equal(basis.medianEngagement, 125); // 100 upvotes + 25 comments; ratio, position, window ignored
    assert.equal(basis.engagementSignals, 1);
    assert.equal(basis.trendsInterest, 60); // the rising row's 5000 is a growth %, not interest
    assert.equal(basis.sources, 3);
  });

  it("skips what was not observed instead of counting it as zero", () => {
    const onlyWeb = demandFromSignals([web(1), web(2)]);
    assert.equal(onlyWeb.basis.medianEngagement, null);
    assert.equal(onlyWeb.basis.trendsInterest, null);
    assert.equal(onlyWeb.basis.questionShare, 1);
    assert.equal(onlyWeb.demand, Math.round(((15 * 1 + 15 * (1 / 3)) / 30) * 100));
  });

  it("buyer intent is the mean over analysed signals only, with the analysed count", () => {
    const mixed = scoreMarket([reddit(1, 50, "strong"), reddit(2, 50, "strong"), ...Array.from({ length: 8 }, (_, i) => web(i))]);
    assert.equal(mixed.factors.buyerIntent, 0.8); // unanalysed rows are not "weak"
    assert.equal(mixed.analysedCount, 2);
    assert.equal(mixed.evidenceCount, 10);
    const none = scoreMarket([web(1), web(2), web(3)]);
    assert.equal(none.factors.buyerIntent, 0);
    assert.equal(none.analysedCount, 0);
    assert.equal(none.score, 0);
  });

  it("problem frequency is the market's share of the run, and competition is not a factor", () => {
    const market = [reddit(1, 50, "strong"), reddit(2, 60, "strong")];
    assert.equal(scoreMarket(market, { totalSignals: 40 }).factors.problemFrequency, 0.2); // 5 % of the run
    assert.equal(scoreMarket(market, { totalSignals: 8 }).factors.problemFrequency, 1); // 25 % or more
    assert.equal(scoreMarket(market, { totalSignals: 80 }).factors.problemFrequency, scoreMarket([...market, ...market], { totalSignals: 160 }).factors.problemFrequency);
    assert.equal("competitiveDensity" in scoreMarket(market).factors, false);
  });
});
