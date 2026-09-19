// lib/evidence/qc.ts — Enforces the 5 normative QC rules from docs/06-EVIDENCE-CONTRACT.md.
// Violations throw QCViolationError, blocking ungrounded claims at write time.

import type { EvidenceInput, EvidenceRow } from "./types.ts";

export class QCViolationError extends Error {
  readonly ruleNumber: 1 | 2 | 3 | 4 | 5;
  readonly code: string;
  readonly details?: unknown;

  constructor(ruleNumber: 1 | 2 | 3 | 4 | 5, message: string, details?: unknown) {
    super(`[QC Rule ${ruleNumber} Violation] ${message}`);
    this.name = "QCViolationError";
    this.ruleNumber = ruleNumber;
    this.code = `QC_RULE_${ruleNumber}_VIOLATION`;
    this.details = details;
  }
}

/**
 * QC Rule 1: No opportunity without evidence.
 * An opportunity cannot exist or be persisted unless backed by at least 1 verified evidence item.
 */
export function enforceRule1_OpportunityEvidence(
  opportunity: { id: string; title: string },
  evidence: Array<EvidenceInput | EvidenceRow>,
): void {
  const matching = evidence.filter(
    (e) => ("entityId" in e ? e.entityId : e.entity_id) === opportunity.id,
  );
  if (matching.length === 0) {
    throw new QCViolationError(
      1,
      `Opportunity "${opportunity.title}" (${opportunity.id}) has 0 evidence rows. Opportunities without evidence are forbidden.`,
      { opportunityId: opportunity.id, title: opportunity.title },
    );
  }
}

/**
 * QC Rule 2: No trend claim without temporal evidence.
 * Allowed trends: emerging | accelerating | seasonal | stable | declining | unknown.
 * Any non-unknown trend claim requires >= 2 distinct temporal data points/observations.
 */
export const VALID_TRENDS = [
  "emerging",
  "accelerating",
  "seasonal",
  "stable",
  "declining",
  "unknown",
] as const;

export type ValidTrend = (typeof VALID_TRENDS)[number];

export function enforceRule2_TrendTemporalEvidence(
  trend: string,
  temporalDataPointsCount: number,
): ValidTrend {
  const normalized = trend.toLowerCase().trim() as ValidTrend;
  if (!VALID_TRENDS.includes(normalized)) {
    throw new QCViolationError(
      2,
      `Invalid trend label "${trend}". Must be one of: ${VALID_TRENDS.join(", ")}`,
      { trend },
    );
  }

  if (normalized !== "unknown" && temporalDataPointsCount < 2) {
    throw new QCViolationError(
      2,
      `Trend "${normalized}" claimed with ${temporalDataPointsCount} temporal data points. Non-unknown trend claims require at least 2 distinct time windows or temporal observations.`,
      { trend: normalized, temporalDataPointsCount },
    );
  }

  return normalized;
}

/**
 * QC Rule 3: No competition claim without observed competitors.
 * If no competitors are observed, the state must explicitly be "none observed".
 * Never fabricates or hallucinates competitors.
 */
export interface ObservedCompetitor {
  platform: string;
  title: string;
  url?: string | null;
  price?: string | null;
}

export function enforceRule3_CompetitionObserved(
  competitors: ObservedCompetitor[],
): { hasCompetitors: boolean; displayState: string } {
  if (competitors.length === 0) {
    return { hasCompetitors: false, displayState: "none observed" };
  }

  for (const comp of competitors) {
    if (!comp.platform || !comp.title) {
      throw new QCViolationError(
        3,
        "Observed competitor must include both platform and title.",
        { competitor: comp },
      );
    }
  }

  return { hasCompetitors: true, displayState: `${competitors.length} observed` };
}

/**
 * QC Rule 4: No demand claim from AI opinion alone.
 * Demand claims or scores MUST cite countable signals (count > 0).
 */
export function enforceRule4_DemandCounts(
  demandDescription: string,
  signalCount: number,
): void {
  if (signalCount <= 0) {
    throw new QCViolationError(
      4,
      `Demand claim "${demandDescription}" has 0 backing signals. Demand claims require observed signal counts > 0.`,
      { demandDescription, signalCount },
    );
  }
}

/**
 * QC Rule 5: Facts != interpretation != suggestion.
 * Asserts structural separation between:
 * - Observed facts (evidence table / raw signals)
 * - AI interpretation (signal_analysis / confidence scores)
 * - Product suggestions (opportunity solution / recommended format)
 */
export function enforceRule5_SeparationOfConcerns(data: {
  facts: Array<{ excerpt?: string | null; url?: string | null; source_id?: string | null }>;
  interpretation: { confidence: number; intent?: string | null; urgency?: string | null };
  suggestion?: { solution?: string | null; format?: string | null };
}): boolean {
  if (!Array.isArray(data.facts) || data.facts.length === 0) {
    throw new QCViolationError(5, "Facts layer missing in structured output.");
  }
  if (typeof data.interpretation?.confidence !== "number") {
    throw new QCViolationError(5, "Interpretation layer missing numeric confidence.");
  }
  return true;
}
