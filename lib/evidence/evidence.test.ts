// lib/evidence/evidence.test.ts — Unit tests for Evidence writer & QC rules 1–5.
// Run: `pnpm test` (node:test + node:assert, no network, no DB).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeEvidence } from "./writer.ts";
import { formatEvidenceClaim, parseEvidenceClaim } from "./types.ts";
import {
  enforceRule1_OpportunityEvidence,
  enforceRule2_TrendTemporalEvidence,
  enforceRule3_CompetitionObserved,
  enforceRule4_DemandCounts,
  enforceRule5_SeparationOfConcerns,
  QCViolationError,
} from "./qc.ts";
import type { EvidenceInput, EvidenceRow } from "./types.ts";

describe("Evidence claim formatting and parsing", () => {
  it("formats claim with signalType and confidence metadata", () => {
    const formatted = formatEvidenceClaim(
      "Frequent Windows BSOD after driver update",
      "pain_point",
      0.88,
    );
    assert.equal(
      formatted,
      "[type: pain_point | conf: 0.88] Frequent Windows BSOD after driver update",
    );
  });

  it("parses claim with metadata", () => {
    const parsed = parseEvidenceClaim(
      "[type: buyer_intent | conf: 0.95] User willing to pay for offline diagnostics guide",
    );
    assert.equal(parsed.signalType, "buyer_intent");
    assert.equal(parsed.confidence, 0.95);
    assert.equal(
      parsed.rawClaim,
      "User willing to pay for offline diagnostics guide",
    );
  });

  it("handles plain claims without brackets gracefully", () => {
    const parsed = parseEvidenceClaim("A simple claim without metadata tags");
    assert.equal(parsed.rawClaim, "A simple claim without metadata tags");
    assert.equal(parsed.signalType, undefined);
    assert.equal(parsed.confidence, undefined);
  });
});

describe("writeEvidence (injected deps)", () => {
  it("inserts valid evidence items and formats claims", async () => {
    const insertedRows: Omit<EvidenceRow, "id">[] = [];
    const deps = {
      insertEvidence: async (rows: Omit<EvidenceRow, "id">[]) => {
        insertedRows.push(...rows);
        return rows.map((r, idx) => ({ id: `ev-${idx + 1}`, ...r }));
      },
    };

    const items: EvidenceInput[] = [
      {
        entityType: "market",
        entityId: "m-1",
        sourceId: "src-reddit",
        claim: "High frequency of boot issues",
        excerpt: "Computer won't boot fans spin",
        url: "https://reddit.com/r/buildapc/1",
        signalType: "pain_point",
        confidence: 0.85,
      },
      {
        entityType: "opportunity",
        entityId: "opp-1",
        claim: "Demand for printable POST code checklist",
        signalType: "pdf_fit",
        confidence: 0.9,
      },
    ];

    const result = await writeEvidence(items, deps);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "ev-1");
    assert.equal(result[0].entity_type, "market");
    assert.ok(result[0].claim.includes("[type: pain_point | conf: 0.85]"));
    assert.equal(result[0].url, "https://reddit.com/r/buildapc/1");

    assert.equal(result[1].id, "ev-2");
    assert.equal(result[1].entity_type, "opportunity");
    assert.equal(result[1].source_id, null);
  });

  it("rejects invalid items missing required fields", async () => {
    const deps = {
      insertEvidence: async (rows: Omit<EvidenceRow, "id">[]) =>
        rows.map((r, i) => ({ id: `${i}`, ...r })),
    };

    await assert.rejects(
      writeEvidence([{ entityType: "market", entityId: "", claim: "valid claim" }], deps),
      /missing entityType or entityId/,
    );

    await assert.rejects(
      writeEvidence([{ entityType: "market", entityId: "m-1", claim: "   " }], deps),
      /missing claim text/,
    );
  });
});

describe("QC Rules 1–5 Enforcement (06-EVIDENCE-CONTRACT.md)", () => {
  it("Rule 1: Blocks opportunity without evidence rows", () => {
    const opp = { id: "opp-fake-1", title: "Non-existent PDF Guide" };
    const evidence: EvidenceRow[] = [];

    assert.throws(
      () => enforceRule1_OpportunityEvidence(opp, evidence),
      (err: unknown) => {
        assert.ok(err instanceof QCViolationError);
        assert.equal(err.ruleNumber, 1);
        assert.ok(err.message.includes("0 evidence rows"));
        return true;
      },
    );
  });

  it("Rule 1: Passes when opportunity is backed by evidence", () => {
    const opp = { id: "opp-real-1", title: "PC Boot Diagnostic Checklist" };
    const evidence: EvidenceInput[] = [
      {
        entityType: "opportunity",
        entityId: "opp-real-1",
        claim: "Supported by multiple boot failure troubleshooting signals",
      },
    ];

    assert.doesNotThrow(() => enforceRule1_OpportunityEvidence(opp, evidence));
  });

  it("Rule 2: Blocks trend claims without temporal evidence (< 2 time windows)", () => {
    // Trend claimed as accelerating, but 0 or 1 data points available
    assert.throws(
      () => enforceRule2_TrendTemporalEvidence("accelerating", 1),
      (err: unknown) => {
        assert.ok(err instanceof QCViolationError);
        assert.equal(err.ruleNumber, 2);
        assert.ok(err.message.includes("at least 2 distinct time windows"));
        return true;
      },
    );

    // Trend 'unknown' is permissible with thin temporal data
    const permittedUnknown = enforceRule2_TrendTemporalEvidence("unknown", 0);
    assert.equal(permittedUnknown, "unknown");

    // Trend 'accelerating' passes with >= 2 data points
    const permittedAcc = enforceRule2_TrendTemporalEvidence("accelerating", 3);
    assert.equal(permittedAcc, "accelerating");
  });

  it("Rule 3: Enforces honest competition observation (none observed vs observed)", () => {
    // Empty state returns 'none observed'
    const emptyState = enforceRule3_CompetitionObserved([]);
    assert.equal(emptyState.hasCompetitors, false);
    assert.equal(emptyState.displayState, "none observed");

    // Observed competitors must have platform and title
    const observed = enforceRule3_CompetitionObserved([
      { platform: "etsy", title: "PC Building Cheat Sheet PDF" },
    ]);
    assert.equal(observed.hasCompetitors, true);
    assert.equal(observed.displayState, "1 observed");

    // Rejects competitor missing platform
    assert.throws(
      () => enforceRule3_CompetitionObserved([{ platform: "", title: "Ghost" }]),
      (err: unknown) => {
        assert.ok(err instanceof QCViolationError);
        assert.equal(err.ruleNumber, 3);
        return true;
      },
    );
  });

  it("Rule 4: Blocks demand claims from AI opinion alone (requires signalCount > 0)", () => {
    assert.throws(
      () => enforceRule4_DemandCounts("High demand for PC repair checklists", 0),
      (err: unknown) => {
        assert.ok(err instanceof QCViolationError);
        assert.equal(err.ruleNumber, 4);
        assert.ok(err.message.includes("require observed signal counts > 0"));
        return true;
      },
    );

    assert.doesNotThrow(() =>
      enforceRule4_DemandCounts("High demand for PC repair checklists", 15),
    );
  });

  it("Rule 5: Enforces structural separation of facts, interpretation, and suggestions", () => {
    const validData = {
      facts: [
        { excerpt: "BSOD error 0x0000000A", url: "https://example.com/1", source_id: "s1" },
      ],
      interpretation: {
        confidence: 0.82,
        intent: "strong",
        urgency: "high",
      },
      suggestion: {
        solution: "Comprehensive BSOD error code diagnostic matrix",
        format: "checklist",
      },
    };

    assert.equal(enforceRule5_SeparationOfConcerns(validData), true);

    // Rejects missing facts layer
    assert.throws(
      () =>
        enforceRule5_SeparationOfConcerns({
          facts: [],
          interpretation: { confidence: 0.5 },
        }),
      (err: unknown) => {
        assert.ok(err instanceof QCViolationError);
        assert.equal(err.ruleNumber, 5);
        return true;
      },
    );
  });
});
