// lib/competition/competition.test.ts — Unit tests for competition analysis, landscape clustering & review mining.
// Run: `pnpm test` (node:test + node:assert, zero network, zero DB).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLandscape,
  mineReviewsAndGaps,
  analyzeCompetition,
  type CompetitorProduct,
} from "./index.ts";

const SAMPLE_COMPETITORS: CompetitorProduct[] = [
  {
    platform: "etsy",
    title: "PC Diagnostic Flowchart PDF",
    seller: "TechPrintables",
    url: "https://www.etsy.com/listing/1",
    price: "$4.99",
    priceNumeric: 4.99,
    format: "checklist",
    rating: 4.9,
    reviewCount: 38,
    positioning: "Quick triage reference sheet",
    promises: ["Step-by-step diagnostic workflow", "Printable offline quick reference"],
    reviews: [
      "Helpful guide, but too technical for my mom who didn't understand registry keys.",
      "Great checklist for fast testing.",
    ],
  },
  {
    platform: "etsy",
    title: "Computer Repair Workbook",
    seller: "ITPrep",
    url: "https://www.etsy.com/listing/2",
    price: "$9.99",
    priceNumeric: 9.99,
    format: "workbook",
    rating: 4.5,
    reviewCount: 12,
    positioning: "Interactive diagnostic workbook",
    promises: ["Step-by-step diagnostic workflow"],
    reviews: ["Missing flowchart for black screen errors when the monitor has no display signal."],
  },
  {
    platform: "gumroad",
    title: "The Ultimate Hardware Troubleshooting Guide",
    seller: "SiliconGuru",
    url: "https://siliconguru.gumroad.com/l/hw-guide",
    price: "$19.00",
    priceNumeric: 19.0,
    format: "guide",
    rating: 4.7,
    reviewCount: 54,
    positioning: "Comprehensive troubleshooting handbook",
    promises: ["Comprehensive diagnostic coverage"],
    reviews: [
      "Dense manual, way too complex for simple fixes.",
      "Wish it had an offline printable checklist because I had no internet when my PC crashed.",
    ],
  },
  {
    platform: "amazon_kdp",
    title: "PC Troubleshooting Handbook",
    seller: "John Expert",
    url: "https://www.amazon.com/dp/B0123",
    price: "$14.99",
    priceNumeric: 14.99,
    format: "guide",
    rating: 4.2,
    reviewCount: 110,
    positioning: "Comprehensive troubleshooting handbook",
    promises: ["Comprehensive diagnostic coverage"],
    reviews: [
      "Confusing instructions on UEFI boot configuration.",
      "Outdated steps that don't apply to Windows 11 updates.",
    ],
  },
];

describe("calculateLandscape (PRD §20)", () => {
  it("computes platform, format, and price tier shares that sum strictly to 100.0%", () => {
    const landscape = calculateLandscape(SAMPLE_COMPETITORS);

    assert.equal(landscape.totalObserved, 4);

    // 1. Platform shares: 2 Etsy (50%), 1 Gumroad (25%), 1 Amazon KDP (25%)
    const platformSum = landscape.platformShares.reduce((acc, s) => acc + s.percentage, 0);
    assert.equal(Math.round(platformSum * 10) / 10, 100.0);
    assert.equal(landscape.platformShares.find((s) => s.label === "etsy")?.percentage, 50.0);
    assert.equal(landscape.platformShares.find((s) => s.label === "gumroad")?.percentage, 25.0);
    assert.equal(landscape.platformShares.find((s) => s.label === "amazon_kdp")?.percentage, 25.0);

    // 2. Format shares: 1 checklist (25%), 1 workbook (25%), 2 guide (50%)
    const formatSum = landscape.formatShares.reduce((acc, s) => acc + s.percentage, 0);
    assert.equal(Math.round(formatSum * 10) / 10, 100.0);

    // 3. Price tier shares: 2 budget (<$10), 2 mid_tier ($10-$25)
    const priceSum = landscape.priceTierShares.reduce((acc, s) => acc + s.percentage, 0);
    assert.equal(Math.round(priceSum * 10) / 10, 100.0);
    assert.equal(landscape.priceTierShares.find((s) => s.label === "budget (<$10)")?.percentage, 50.0);
    assert.equal(landscape.priceTierShares.find((s) => s.label === "mid_tier ($10-$25)")?.percentage, 50.0);

    // 4. Averages
    assert.ok(landscape.averagePrice);
    // (4.99 + 9.99 + 19.00 + 14.99) / 4 = 48.97 / 4 = 12.24
    assert.equal(landscape.averagePrice, 12.24);

    assert.ok(landscape.averageRating);
    // (4.9 + 4.5 + 4.7 + 4.2) / 4 = 18.3 / 4 = 4.575 -> 4.6
    assert.equal(landscape.averageRating, 4.6);
  });

  it("handles empty competitor array gracefully", () => {
    const empty = calculateLandscape([]);
    assert.equal(empty.totalObserved, 0);
    assert.equal(empty.platformShares.length, 0);
    assert.equal(empty.formatShares.length, 0);
    assert.equal(empty.priceTierShares.length, 0);
    assert.equal(empty.averagePrice, null);
    assert.equal(empty.averageRating, null);
  });
});

describe("mineReviewsAndGaps (PRD §21)", () => {
  it("mines review feedback into likes, dislikes, missing, confusing, requests", () => {
    const { reviewMining, productGaps } = mineReviewsAndGaps(SAMPLE_COMPETITORS);

    assert.ok(reviewMining.dislikes.length > 0);
    assert.ok(reviewMining.missing.length > 0);
    assert.ok(reviewMining.confusing.length > 0);
    assert.ok(reviewMining.requests.length > 0);

    assert.ok(productGaps.length >= 1);
  });

  it("satisfies Acceptance Criteria: >=1 gap traces to quoted review excerpts", () => {
    const { productGaps } = mineReviewsAndGaps(SAMPLE_COMPETITORS);

    assert.ok(productGaps.length >= 1);
    for (const gap of productGaps) {
      assert.ok(gap.title);
      assert.ok(gap.summary);
      assert.ok(gap.opportunityTranslation);
      assert.ok(gap.reviewExcerpts.length >= 1);

      // Verify each excerpt has quote, source, and url
      const firstExcerpt = gap.reviewExcerpts[0];
      assert.ok(firstExcerpt.quote.length > 0);
      assert.ok(firstExcerpt.source.length > 0);
    }

    // Check specific "too_technical" gap from the fixture
    const technicalGap = productGaps.find((g) => g.category === "too_technical");
    assert.ok(technicalGap);
    assert.ok(technicalGap.opportunityTranslation.toLowerCase().includes("plain-english"));
    assert.ok(technicalGap.reviewExcerpts.some((e) => e.quote.toLowerCase().includes("too technical")));
  });

  it("creates grounded fallback gap if signals are sparse", () => {
    const sparse = mineReviewsAndGaps([], [{ content: "Users report frequent crashes when booting Windows." }]);
    assert.ok(sparse.productGaps.length >= 1);
    assert.ok(sparse.productGaps[0].reviewExcerpts.length >= 1);
  });
});

describe("analyzeCompetition integration", () => {
  it("produces full CompetitionAnalysisResult", () => {
    const result = analyzeCompetition({
      competitors: SAMPLE_COMPETITORS,
      signals: [{ title: "User feedback", content: "I was lost at step 3 because it had confusing instructions." }],
    });

    assert.equal(result.competitors.length, 4);
    assert.equal(result.landscape.totalObserved, 4);
    assert.ok(result.productGaps.length >= 1);
  });
});
