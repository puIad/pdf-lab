// lib/scoring/scoring.test.ts — Unit tests for market scoring and PDF suitability.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreMarket } from "./scoring.ts";
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
