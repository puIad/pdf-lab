// lib/export/types.ts — Normative types for PDF LAB export formats per PRD §46 & §55.
// Supports Markdown, CSV (RFC 4180), and JSON formats with round-trip schema validation.

import type { ResearchCompleteness } from "../runs/types.ts";

export type ExportFormat = "markdown" | "csv" | "json";

export interface ExportEvidenceItem {
  id?: string;
  claim: string;
  excerpt?: string | null;
  url?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  createdAt?: string;
}

export interface ExportOpportunity {
  id: string;
  marketId: string;
  title: string;
  targetAudience: string;
  problem: string;
  solution: string;
  format: string;
  priceRange: string;
  opportunityScore: number;
  confidence: number;
  evidenceCount: number;
  evidence: ExportEvidenceItem[];
}

export interface ExportCompetitor {
  platform: string;
  title: string;
  url?: string | null;
  price?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  format?: string;
}

export interface ExportProductGap {
  id?: string;
  title?: string;
  category?: string;
  gap: string;
  evidence: string;
  opportunityTranslation?: string;
  sourceType?: string | null;
  sourceUrl?: string | null;
}

export interface ExportMarket {
  id: string;
  name: string;
  description: string | null;
  trend: string;
  demandScore: number;
  competitionScore: number;
  pdfFitScore: number;
  confidence: number;
  createdAt: string;
}

export interface ReportExportData {
  version: "1.0";
  exportedAt: string;
  query: string;
  market: ExportMarket;
  completeness: ResearchCompleteness;
  competitors: ExportCompetitor[];
  productGaps: ExportProductGap[];
  customerQuotes: Array<{ quote: string; url?: string | null }>;
  opportunities: ExportOpportunity[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  recounted: {
    opportunitiesCount: number;
    evidenceCount: number;
    evidenceBackedOpportunitiesCount: number;
    completenessPercentage: number;
  };
  isRoundTripAccurate: boolean;
}
