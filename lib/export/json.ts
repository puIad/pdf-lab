// lib/export/json.ts — JSON serialization and round-trip recounting/schema validation per PRD §46 & §55.

import type { ReportExportData, ValidationResult } from "./types.ts";
import { calculateCompleteness } from "../runs/completeness.ts";

/**
 * Serializes ReportExportData to structured, indented JSON.
 */
export function generateReportJson(data: ReportExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Validates a report JSON payload against the normative schema
 * and recounts all opportunities, citations, and completeness percentage to verify round-trip fidelity.
 */
export function validateAndRecountJson(input: string | unknown): ValidationResult {
  const errors: string[] = [];

  let data: Record<string, unknown>;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input) as Record<string, unknown>;
    } catch (e) {
      return {
        valid: false,
        errors: [`JSON parse failed: ${e instanceof Error ? e.message : String(e)}`],
        recounted: {
          opportunitiesCount: 0,
          evidenceCount: 0,
          evidenceBackedOpportunitiesCount: 0,
          completenessPercentage: 0,
        },
        isRoundTripAccurate: false,
      };
    }
  } else if (input && typeof input === "object") {
    data = input as Record<string, unknown>;
  } else {
    return {
      valid: false,
      errors: ["Input must be a valid JSON string or object"],
      recounted: {
        opportunitiesCount: 0,
        evidenceCount: 0,
        evidenceBackedOpportunitiesCount: 0,
        completenessPercentage: 0,
      },
      isRoundTripAccurate: false,
    };
  }

  // 1. Schema Validation
  if (data.version !== "1.0") {
    errors.push(`Expected version '1.0', received: ${String(data.version)}`);
  }

  if (!data.market || typeof data.market !== "object") {
    errors.push("Missing or invalid 'market' object in report");
  } else {
    const market = data.market as Record<string, unknown>;
    if (typeof market.id !== "string" || !market.id) errors.push("market.id is required");
    if (typeof market.name !== "string" || !market.name) errors.push("market.name is required");
    if (typeof market.trend !== "string") errors.push("market.trend is required");
    if (typeof market.demandScore !== "number") errors.push("market.demandScore must be a number");
    if (typeof market.confidence !== "number") errors.push("market.confidence must be a number");
  }

  if (!data.completeness || typeof data.completeness !== "object") {
    errors.push("Missing or invalid 'completeness' object in report");
  }

  if (!Array.isArray(data.opportunities)) {
    errors.push("Missing or invalid 'opportunities' array in report");
  }

  const rawOpps = (Array.isArray(data.opportunities) ? data.opportunities : []) as Array<
    Record<string, unknown>
  >;

  // Validate each opportunity structure
  let totalEvidenceCount = 0;
  let evidenceBackedCount = 0;

  rawOpps.forEach((opp, idx) => {
    const prefix = `opportunities[${idx}]`;
    if (typeof opp.id !== "string") errors.push(`${prefix}.id must be a string`);
    if (typeof opp.title !== "string" || !opp.title) errors.push(`${prefix}.title is required`);
    if (typeof opp.targetAudience !== "string") errors.push(`${prefix}.targetAudience is required`);
    if (typeof opp.problem !== "string") errors.push(`${prefix}.problem is required`);
    if (typeof opp.solution !== "string") errors.push(`${prefix}.solution is required`);
    if (typeof opp.format !== "string") errors.push(`${prefix}.format is required`);
    if (typeof opp.opportunityScore !== "number") errors.push(`${prefix}.opportunityScore must be a number`);
    if (typeof opp.confidence !== "number") errors.push(`${prefix}.confidence must be a number`);

    if (!Array.isArray(opp.evidence)) {
      errors.push(`${prefix}.evidence must be an array`);
    } else {
      const evList = opp.evidence as Array<Record<string, unknown>>;
      totalEvidenceCount += evList.length;
      if (evList.length > 0) {
        evidenceBackedCount++;
      }

      evList.forEach((ev, evIdx) => {
        if (typeof ev.claim !== "string" || !ev.claim) {
          errors.push(`${prefix}.evidence[${evIdx}].claim is required`);
        }
      });
    }
  });

  const opportunitiesCount = rawOpps.length;

  // 2. Recount and re-calculate completeness
  const completeness = (data.completeness || {}) as Record<string, unknown>;
  const sourcesCovered = typeof completeness.sourcesCovered === "number" ? completeness.sourcesCovered : 0;
  const signalsCollected = typeof completeness.signalsCollected === "number" ? completeness.signalsCollected : 0;
  const signalsAnalyzed = typeof completeness.signalsAnalyzed === "number" ? completeness.signalsAnalyzed : 0;
  const marketsIdentified = typeof completeness.marketsIdentified === "number" ? completeness.marketsIdentified : 0;

  const recalculated = calculateCompleteness({
    sourcesCovered,
    signalsCollected,
    signalsAnalyzed,
    marketsIdentified,
    opportunitiesGenerated: opportunitiesCount,
    evidenceCount: totalEvidenceCount,
    evidenceBackedOpportunitiesCount: evidenceBackedCount,
  });

  // 3. Round-trip fidelity checks
  const statedOppsCount = completeness.opportunitiesGenerated;
  const statedBackedCount = completeness.evidenceBackedOpportunitiesCount;
  const statedEvidenceCount = completeness.evidenceCount;

  const oppsCountMatch = statedOppsCount === undefined || statedOppsCount === opportunitiesCount;
  const backedCountMatch = statedBackedCount === undefined || statedBackedCount === evidenceBackedCount;
  const evidenceCountMatch = statedEvidenceCount === undefined || statedEvidenceCount === totalEvidenceCount;

  const isRoundTripAccurate = errors.length === 0 && oppsCountMatch && backedCountMatch && evidenceCountMatch;

  return {
    valid: errors.length === 0,
    errors,
    recounted: {
      opportunitiesCount,
      evidenceCount: totalEvidenceCount,
      evidenceBackedOpportunitiesCount: evidenceBackedCount,
      completenessPercentage: recalculated.completenessPercentage,
    },
    isRoundTripAccurate,
  };
}
