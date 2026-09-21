// lib/export/export.test.ts — Unit and round-trip tests for export engine per PRD §46 & §55.

import test from "node:test";
import assert from "node:assert/strict";
import {
  generateReportMarkdown,
  generateReportCsv,
  generateReportJson,
  validateAndRecountJson,
  escapeCsvField,
  type ReportExportData,
} from "./index.ts";

function createMockReportData(oppCount = 25): ReportExportData {
  const opportunities = Array.from({ length: oppCount }, (_, i) => {
    const rank = i + 1;
    return {
      id: `opp-uuid-${rank}`,
      marketId: "market-uuid-1",
      title: `Diagnostic Action Checklist #${rank} for PC Troubleshooting`,
      targetAudience: `Audience Segment ${rank}`,
      problem: `Hardware instability and BSOD error code 0x${rank}A`,
      solution: `Step-by-step diagnostic isolation, BIOS reset, and driver rollback protocol.`,
      format: i % 2 === 0 ? "checklist" : "guide",
      priceRange: "$12–$19",
      opportunityScore: 85 - i,
      confidence: 0.85,
      evidenceCount: 2,
      evidence: [
        {
          id: `ev-${rank}-1`,
          claim: `Users frequently report recurring crash loops on Windows 11 updates`,
          excerpt: `My PC crashed 3 times today after the patch with memory error`,
          url: `https://reddit.com/r/pchelp/comments/post_${rank}`,
          sourceName: "Reddit r/pchelp",
          sourceType: "reddit",
          createdAt: "2026-09-17T12:00:00Z",
        },
        {
          id: `ev-${rank}-2`,
          claim: `Rising search volume for memory diagnostic steps`,
          excerpt: `PC troubleshooting guide search delta +45%`,
          url: `https://trends.google.com/trends/explore?q=pc+troubleshooting`,
          sourceName: "Google Trends",
          sourceType: "gtrends",
          createdAt: "2026-09-17T12:00:00Z",
        },
      ],
    };
  });

  return {
    version: "1.0",
    exportedAt: "2026-09-21T02:00:00.000Z",
    query: "pc troubleshooting",
    market: {
      id: "market-uuid-1",
      name: "PC Fault Diagnosis and Repair",
      description: "Observed hardware and software troubleshooting bottlenecks.",
      trend: "accelerating",
      demandScore: 88,
      competitionScore: 42,
      pdfFitScore: 92,
      confidence: 0.86,
      createdAt: "2026-09-19T12:00:00.000Z",
    },
    completeness: {
      sourcesCovered: 3,
      signalsCollected: 25,
      signalsAnalyzed: 25,
      marketsIdentified: 14,
      opportunitiesGenerated: oppCount,
      evidenceCount: oppCount * 2,
      evidenceBackedOpportunitiesCount: oppCount,
      completenessPercentage: 100,
    },
    competitors: [
      {
        platform: "etsy",
        title: "Printable PC Repair Checklist & Flowchart",
        url: "https://etsy.com/listing/12345",
        price: "$8.50",
        rating: 4.8,
        reviewCount: 42,
      },
      {
        platform: "gumroad",
        title: "Ultimate Windows Troubleshooting Handbook",
        url: "https://gumroad.com/l/pchandbook",
        price: "$19.00",
        rating: 4.9,
        reviewCount: 118,
      },
    ],
    productGaps: [
      {
        gap: "Existing guides are too technical for non-builders",
        evidence: "Review quote: 'Too much command line jargon, needs plain English step-by-step.'",
        sourceType: "reddit",
        sourceUrl: "https://reddit.com/r/pchelp/comments/review_1",
      },
    ],
    customerQuotes: [
      {
        quote: "I just need a simple checklist before I take this to a repair shop.",
        url: "https://reddit.com/r/techsupport/post_xyz",
      },
    ],
    opportunities,
  };
}

test("escapeCsvField conforms to RFC 4180", () => {
  assert.equal(escapeCsvField("simple"), "simple");
  assert.equal(escapeCsvField("with,comma"), '"with,comma"');
  assert.equal(escapeCsvField('with"quote'), '"with""quote"');
  assert.equal(escapeCsvField("line\nbreak"), '"line\nbreak"');
  assert.equal(escapeCsvField('comma,"quote",newline\n'), '"comma,""quote"",newline\n"');
  assert.equal(escapeCsvField(null), "");
  assert.equal(escapeCsvField(undefined), "");
});

test("generateReportCsv produces valid RFC-4180 CSV containing all 25 opportunities", () => {
  const data = createMockReportData(25);
  const csv = generateReportCsv(data);

  const lines = csv.trim().split("\n");
  // Header line + 25 data rows = 26 lines
  assert.equal(lines.length, 26, "CSV must contain header + exactly 25 opportunity rows");

  // Check header row columns
  const header = lines[0];
  assert.ok(header.includes("Rank"));
  assert.ok(header.includes("Opportunity ID"));
  assert.ok(header.includes("Title"));
  assert.ok(header.includes("Target Audience"));
  assert.ok(header.includes("Problem"));
  assert.ok(header.includes("Solution"));
  assert.ok(header.includes("Format"));
  assert.ok(header.includes("Opportunity Score"));
  assert.ok(header.includes("Confidence"));
  assert.ok(header.includes("Evidence URLs"));

  // Check sample data row
  const row1 = lines[1];
  assert.ok(row1.includes("Diagnostic Action Checklist #1"));
  assert.ok(row1.includes("https://reddit.com/r/pchelp/comments/post_1"));
});

test("generateReportMarkdown produces structured, cited document per PRD §46 & §55", () => {
  const data = createMockReportData(25);
  const md = generateReportMarkdown(data);

  // 1. Report Title & Header
  assert.ok(md.includes("# PDF LAB Research Report: PC Fault Diagnosis and Repair"));
  assert.ok(md.includes("pc troubleshooting"));

  // 2. Section 1: Research Quality & Completeness Panel
  assert.ok(md.includes("## 1. Research Quality & Completeness Panel"));
  assert.ok(md.includes("**100%**"));
  assert.ok(md.includes("QC Rule 1"));
  assert.ok(md.includes("QC Rule 2"));
  assert.ok(md.includes("QC Rule 3"));
  assert.ok(md.includes("QC Rule 4"));
  assert.ok(md.includes("QC Rule 5"));

  // 3. Section 2: Market Overview
  assert.ok(md.includes("## 2. Market Overview & Intelligence"));
  assert.ok(md.includes("ACCELERATING"));

  // 4. Section 3: Competitive Landscape & Product Gaps
  assert.ok(md.includes("## 3. Competitive Landscape & Mined Product Gaps"));
  assert.ok(md.includes("Printable PC Repair Checklist & Flowchart"));
  assert.ok(md.includes("Existing guides are too technical for non-builders"));

  // 5. Section 4: All 25 opportunities with clickable evidence links
  assert.ok(md.includes("## 4. Top 25 Diversified PDF Opportunities"));
  for (let i = 1; i <= 25; i++) {
    assert.ok(md.includes(`### ${i}. Diagnostic Action Checklist #${i}`));
    assert.ok(md.includes(`https://reddit.com/r/pchelp/comments/post_${i}`));
  }
});

test("generateReportJson and validateAndRecountJson verify schema and round-trip fidelity", () => {
  const data = createMockReportData(25);
  const jsonStr = generateReportJson(data);

  // Validate and recount
  const result = validateAndRecountJson(jsonStr);

  assert.equal(result.valid, true, `Validation errors: ${result.errors.join("; ")}`);
  assert.equal(result.errors.length, 0);
  assert.equal(result.isRoundTripAccurate, true);
  assert.equal(result.recounted.opportunitiesCount, 25);
  assert.equal(result.recounted.evidenceBackedOpportunitiesCount, 25);
  assert.equal(result.recounted.evidenceCount, 50);
  assert.equal(result.recounted.completenessPercentage, 100);
});

test("validateAndRecountJson flags schema violations and count mismatches", () => {
  // Corrupt payload: missing title, wrong type for score, unbacked opportunity
  const corruptData = {
    version: "1.0",
    market: { id: "m1", name: "Market", trend: "stable", demandScore: 50, confidence: 0.8 },
    completeness: {
      sourcesCovered: 3,
      signalsCollected: 10,
      signalsAnalyzed: 10,
      marketsIdentified: 2,
      opportunitiesGenerated: 2,
      evidenceCount: 10, // Stated 10 but will only recount 1
      evidenceBackedOpportunitiesCount: 2,
    },
    opportunities: [
      {
        id: "opp-1",
        title: "", // Empty title error
        targetAudience: "Audience",
        problem: "Problem",
        solution: "Solution",
        format: "checklist",
        opportunityScore: "invalid_score", // Number required error
        confidence: 0.7,
        evidence: [{ claim: "A claim" }],
      },
      {
        id: "opp-2",
        title: "Valid Title",
        targetAudience: "Audience 2",
        problem: "Problem 2",
        solution: "Solution 2",
        format: "guide",
        opportunityScore: 70,
        confidence: 0.7,
        evidence: [], // Zero evidence!
      },
    ],
  };

  const result = validateAndRecountJson(corruptData);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("title is required")));
  assert.ok(result.errors.some((e) => e.includes("opportunityScore must be a number")));
  assert.equal(result.isRoundTripAccurate, false);
  assert.equal(result.recounted.opportunitiesCount, 2);
  assert.equal(result.recounted.evidenceCount, 1);
  assert.equal(result.recounted.evidenceBackedOpportunitiesCount, 1);
});
