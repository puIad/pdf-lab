// lib/export/csv.ts — RFC 4180 compliant CSV export for PDF LAB opportunities report.

import type { ReportExportData, ValidationResult } from "./types.ts";
import type { IdeasResult } from "../ideas/ideas.ts";

/**
 * Escapes a cell according to RFC 4180:
 * If the value contains quotes, commas, or line breaks,
 * enclose in double quotes and escape internal quotes by doubling them ("").
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  let str = String(val);
  // Mitigate CSV formula injection (M-1)
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC-4180 compliant CSV string representing all opportunities in the report.
 */
export function generateReportCsv(data: ReportExportData): string {
  const headers = [
    "Rank",
    "Opportunity ID",
    "Title",
    "Target Audience",
    "Problem",
    "Solution",
    "Format",
    "Price Range",
    "Opportunity Score",
    "Confidence",
    "Evidence Count",
    "Evidence URLs",
    "Evidence Claims",
    "Market Name",
    "Market Trend",
    "Exported At",
  ];

  const rows: string[] = [headers.map(escapeCsvField).join(",")];

  data.opportunities.forEach((opp, index) => {
    const rank = index + 1;
    const evidenceUrls = opp.evidence
      .map((e) => e.url)
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .join("; ");

    const evidenceClaims = opp.evidence
      .map((e) => e.claim)
      .filter((c) => c && c.trim().length > 0)
      .join("; ");

    const row = [
      rank,
      opp.id,
      opp.title,
      opp.targetAudience,
      opp.problem,
      opp.solution,
      opp.format,
      opp.priceRange,
      opp.opportunityScore,
      opp.confidence,
      opp.evidenceCount,
      evidenceUrls,
      evidenceClaims,
      data.market.name,
      data.market.trend,
      data.exportedAt,
    ];

    rows.push(row.map(escapeCsvField).join(","));
  });

  return rows.join("\n") + "\n";
}

// ---- Quick-ideas scan CSV (Phase 3 Part 3.7) ----

export const SCAN_CSV_HEADERS = [
  "Rank",
  "Phrase",
  "Title",
  "Format",
  "Intent",
  "Opportunity",
  "Demand",
  "Demand Basis",
  "PDF Fit",
  "Trend",
  "Trend Basis",
  "Effort",
  "Interest",
  "Phrase Specificity",
  "Confidence",
  "Observed In",
  "Not Professional Advice",
  "Timely",
  "Evidence Count",
  "Evidence IDs",
  "Evidence URLs",
  "Seed",
  "Region",
  "Scanned At",
] as const;

/** One row per idea: every score next to the basis and evidence it came from. */
export function generateScanCsv(result: IdeasResult, meta: { region: string; scannedAt: string }): string {
  const rows = [SCAN_CSV_HEADERS.map(escapeCsvField).join(",")];
  result.ideas.forEach((idea, index) => {
    rows.push(
      [
        index + 1,
        idea.phrase,
        idea.title,
        idea.format,
        idea.intent,
        idea.opportunity,
        idea.demand,
        idea.demandBasis,
        idea.fit,
        idea.trend ?? "not observed",
        idea.trendBasis ?? "",
        idea.effort,
        idea.interest,
        idea.specificity,
        idea.confidence,
        idea.engines.join("; "),
        idea.advice ?? "",
        idea.timely ? "yes" : "no",
        idea.evidence.length,
        idea.evidence.map((e) => e.source_id).join("; "),
        idea.evidence.map((e) => e.url ?? "").filter(Boolean).join("; "),
        result.seed,
        meta.region,
        meta.scannedAt,
      ]
        .map(escapeCsvField)
        .join(","),
    );
  });
  return rows.join("\n") + "\n";
}

/** RFC 4180 parser: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Re-read a scan CSV and recount it against the scan it came from (the 2.4 round-trip check). */
export function recountScanCsv(csv: string, source: IdeasResult): ValidationResult {
  const errors: string[] = [];
  const [header = [], ...rows] = parseCsv(csv);
  if (header.join(",") !== SCAN_CSV_HEADERS.join(",")) errors.push("header does not match SCAN_CSV_HEADERS");
  const col = (name: (typeof SCAN_CSV_HEADERS)[number]) => SCAN_CSV_HEADERS.indexOf(name);
  let evidenceCount = 0;
  let backed = 0;
  rows.forEach((r, i) => {
    if (r.length !== SCAN_CSV_HEADERS.length) errors.push(`row ${i + 1}: ${r.length} fields`);
    const stated = Number(r[col("Evidence Count")]);
    const ids = (r[col("Evidence IDs")] ?? "").split("; ").filter(Boolean).length;
    if (stated !== ids) errors.push(`row ${i + 1}: Evidence Count ${stated} but ${ids} ids`);
    evidenceCount += ids;
    if (ids > 0) backed++;
  });
  const sourceEvidence = source.ideas.reduce((a, i) => a + i.evidence.length, 0);
  const isRoundTripAccurate = errors.length === 0 && rows.length === source.ideas.length && evidenceCount === sourceEvidence;
  if (rows.length !== source.ideas.length) errors.push(`${rows.length} rows for ${source.ideas.length} ideas`);
  if (evidenceCount !== sourceEvidence) errors.push(`${evidenceCount} evidence ids for ${sourceEvidence} in the scan`);
  return {
    valid: errors.length === 0,
    errors,
    recounted: {
      opportunitiesCount: rows.length,
      evidenceCount,
      evidenceBackedOpportunitiesCount: backed,
      completenessPercentage: rows.length ? Math.round((backed / rows.length) * 100) : 0,
    },
    isRoundTripAccurate,
  };
}
