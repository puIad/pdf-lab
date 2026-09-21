// lib/export/csv.ts — RFC 4180 compliant CSV export for PDF LAB opportunities report.

import type { ReportExportData } from "./types.ts";

/**
 * Escapes a cell according to RFC 4180:
 * If the value contains quotes, commas, or line breaks,
 * enclose in double quotes and escape internal quotes by doubling them ("").
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  const str = String(val);
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
