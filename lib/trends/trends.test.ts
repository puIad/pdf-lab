// lib/trends/trends.test.ts — Unit and Acceptance tests for Phase 3.3 Trending Engine & Market Radar.
// Specs: docs/phases/phase-3-explorer.md (Part 3.3 Acceptance), docs/05-PIPELINE-SCORING.md (QC Rule 2).

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTopicTrend,
  type SignalRecord,
} from "./detector.ts";
import { checkTopicSeasonality, predictUpcomingSeasonalSurges } from "./seasonality.ts";
import { TrendingRadarService } from "./service.ts";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00Z").getTime();

test("multi-window detection slices 7d, 30d, 90d, and 12m correctly", () => {
  const signals: SignalRecord[] = [
    // 7d: 2 signals
    {
      id: "s1",
      sourceType: "youtube",
      title: "How to fix BIOS memory timing error",
      content: "Need a clear checklist for BIOS settings",
      publishedAt: NOW - 2 * DAY_MS,
      intent: "very_strong",
      engagement: { upvotes: 20, comments: 4 },
    },
    {
      id: "s2",
      sourceType: "reddit",
      title: "RAM overclocking crash diagnostic",
      content: "Is there a PDF flowchart for diagnostic steps?",
      publishedAt: NOW - 5 * DAY_MS,
      intent: "strong",
      engagement: { upvotes: 35, comments: 8 },
    },
    // 30d (between 7d and 30d): 1 signal
    {
      id: "s3",
      sourceType: "youtube",
      title: "DDR5 guide",
      content: "Video explanation of RAM voltages",
      publishedAt: NOW - 20 * DAY_MS,
      intent: "medium",
      engagement: { upvotes: 10, comments: 2 },
    },
    // 90d (between 30d and 90d): 1 signal
    {
      id: "s4",
      sourceType: "reddit",
      title: "Older RAM discussion",
      content: "General thoughts on DDR5 stability",
      publishedAt: NOW - 60 * DAY_MS,
      intent: "weak",
      engagement: { upvotes: 5, comments: 1 },
    },
  ];

  const result = detectTopicTrend({
    marketId: "test-m1",
    topicName: "RAM Timing Troubleshooting",
    category: "tech",
    signals,
    referenceDate: new Date(NOW),
  });

  assert.equal(result.windows["7d"].mentionCount, 2);
  assert.equal(result.windows["30d"].mentionCount, 3);
  assert.equal(result.windows["90d"].mentionCount, 4);
  assert.equal(result.windows["12m"].mentionCount, 4);
  assert.ok(result.windows["7d"].velocityPerDay > 0);
  assert.equal(result.windows["7d"].youtubeCount, 1);
  assert.equal(result.windows["7d"].redditCount, 1);
});

test("known spike fixture is classified correctly with temporal deltas (emerging breakout)", () => {
  // Burst fixture: sudden surge in the last 7 days compared to prior 7 days
  const spikeSignals: SignalRecord[] = [];

  // Current 7d: 8 high-intent signals (YouTube + Reddit)
  for (let i = 1; i <= 8; i++) {
    spikeSignals.push({
      id: `burst_${i}`,
      sourceType: i % 2 === 0 ? "youtube" : "reddit",
      title: `Local LLM parameter crash ${i}`,
      content: `Need a step-by-step PDF guide on VRAM quantization formulas. The tutorial video skipped step ${i}.`,
      publishedAt: NOW - (i % 6) * DAY_MS,
      intent: "very_strong",
      engagement: { upvotes: 50 + i * 10, comments: 15 },
    });
  }

  // Prior 7d: only 1 small signal
  spikeSignals.push({
    id: "prior_1",
    sourceType: "reddit",
    title: "Old llama question",
    content: "Has anyone tried running 7b models?",
    publishedAt: NOW - 10 * DAY_MS,
    intent: "weak",
    engagement: { upvotes: 5, comments: 1 },
  });

  const analysis = detectTopicTrend({
    marketId: "spike-m1",
    topicName: "Local LLM Fine-Tuning on Consumer GPUs",
    category: "tech",
    signals: spikeSignals,
    competitorCount: 0,
    referenceDate: new Date(NOW),
  });

  // Must be emerging or accelerating with high WoW delta
  assert.ok(analysis.classification === "emerging" || analysis.classification === "accelerating");
  assert.ok(analysis.wowDeltaPercent >= 30, `Expected WoW >= 30%, got ${analysis.wowDeltaPercent}%`);
  assert.ok(analysis.momentumScore >= 60, `Expected momentum >= 60, got ${analysis.momentumScore}`);
  assert.ok(analysis.gapIndex >= 1.5, `Expected gapIndex >= 1.5, got ${analysis.gapIndex}`);
  assert.ok(analysis.solvable, "Expected local LLM troubleshooting to be PDF-solvable");
  assert.ok(analysis.recommendedFormats.includes("guide") || analysis.recommendedFormats.includes("cheat_sheet"));
});

test("QC Rule 2: No trend claim without temporal evidence deltas", () => {
  const service = new TrendingRadarService();
  const topics = service.getAnalyzedTopics();

  assert.ok(topics.length > 0);
  for (const topic of topics) {
    assert.ok(
      topic.temporalEvidence.length >= 3,
      `Topic ${topic.topicName} failed QC Rule 2: missing temporal evidence array`
    );
    // Must cite 7d and 30d volume and WoW/MoM percentages
    const combinedEvidence = topic.temporalEvidence.join(" ");
    assert.match(combinedEvidence, /7-day volume/i);
    assert.match(combinedEvidence, /30-day volume/i);
    assert.match(combinedEvidence, /WoW/i);
  }
});

test("seasonal probe returns dated reasoning and 30-60 day surge forecasts (PRD §24)", () => {
  const marchDate = new Date("2026-03-01T00:00:00Z");
  const taxSeasonal = checkTopicSeasonality("Freelancer Tax Deductions & 1099 Checklist", [], marchDate);
  assert.equal(taxSeasonal.isSeasonal, true);
  assert.match(taxSeasonal.reasoning || "", /annual baseline in 12m data/i);

  // Predict upcoming seasonal surges
  const forecasts = predictUpcomingSeasonalSurges(marchDate);
  assert.ok(forecasts.length > 0);
  const taxForecast = forecasts.find((f) => f.topicName.includes("Tax"));
  assert.ok(taxForecast);
  assert.ok(taxForecast.expectedSurgeWindowDays >= 30);
  assert.ok(taxForecast.historicalEvidence.length > 0);
  assert.ok(taxForecast.actionRecommendation.length > 0);
});

test("solvability filter gates non-solvable problems", () => {
  const solvableSignals: SignalRecord[] = [
    {
      id: "sol_1",
      sourceType: "reddit",
      title: "PC BSOD stop codes checklist",
      content: "Step by step diagnostic flowchart for troubleshooting blue screens",
      publishedAt: NOW - 2 * DAY_MS,
      intent: "very_strong",
    },
  ];

  const unsolvableSignals: SignalRecord[] = [
    {
      id: "unsol_1",
      sourceType: "youtube",
      title: "Micro-soldering motherboard capacitor replacement",
      content: "How to solder BGA chip with rework station and welding equipment",
      publishedAt: NOW - 2 * DAY_MS,
      intent: "strong",
    },
  ];

  const solvableRes = detectTopicTrend({
    marketId: "sol-1",
    topicName: "PC BSOD Diagnostic Flowchart",
    signals: solvableSignals,
    referenceDate: new Date(NOW),
  });

  const unsolvableRes = detectTopicTrend({
    marketId: "unsol-1",
    topicName: "Motherboard Micro-Soldering Hardware Repair",
    signals: unsolvableSignals,
    referenceDate: new Date(NOW),
  });

  assert.equal(solvableRes.solvable, true);
  assert.ok(solvableRes.pdfFitScore >= 0.65);

  assert.equal(unsolvableRes.solvable, false);
  assert.ok(unsolvableRes.pdfFitScore < 0.65);
});

test("radar calculator maps coordinates and builds synchronized 4-window snapshots", () => {
  const service = new TrendingRadarService();
  const snapshots = service.getFourWindowSnapshots();

  assert.ok(snapshots["7d"]);
  assert.ok(snapshots["30d"]);
  assert.ok(snapshots["90d"]);
  assert.ok(snapshots["12m"]);

  const node7d = snapshots["7d"].nodes[0];
  assert.ok(node7d);
  assert.ok(node7d.coordinates.radius >= 0.08 && node7d.coordinates.radius <= 0.95);
  assert.ok(node7d.coordinates.angleDegrees >= 0 && node7d.coordinates.angleDegrees <= 360);
  assert.ok(node7d.coordinates.x >= 0 && node7d.coordinates.x <= 100);
  assert.ok(node7d.coordinates.y >= 0 && node7d.coordinates.y <= 100);
  assert.ok(node7d.coordinates.dotSize >= 4 && node7d.coordinates.dotSize <= 22);
  assert.ok(["#10B981", "#8B5CF6", "#F59E0B", "#06B6D4", "#64748B"].includes(node7d.coordinates.velocityColor));
});

test("service filters by source (YouTube vs Reddit) and category", () => {
  const service = new TrendingRadarService();

  const ytOnlyTopics = service.getAnalyzedTopics({ source: "youtube" });
  assert.ok(ytOnlyTopics.length > 0);
  for (const t of ytOnlyTopics) {
    assert.equal(t.windows["30d"].redditCount, 0);
    assert.ok(t.windows["30d"].youtubeCount >= 0);
  }

  const techTopics = service.getAnalyzedTopics({ category: "tech" });
  for (const t of techTopics) {
    assert.equal(t.category, "tech");
  }

  const solvableTopics = service.getSolvableOpportunities(5, 0.7);
  for (const opp of solvableTopics) {
    assert.ok(opp.pdfFitScore >= 0.7);
  }
});
