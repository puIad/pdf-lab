// lib/opportunities/types.ts — Opportunity generation types and diversification constraints.
// Normative specs: PRD §18, §28–§29; docs/05-PIPELINE-SCORING.md; docs/06-EVIDENCE-CONTRACT.md.

import type { EvidenceInput } from "../evidence/types.ts";

export const OPPORTUNITY_PROMPT_VERSION = "2026-09-20.1";

export const ALLOWED_FORMATS = [
  "checklist",
  "guide",
  "planner",
  "workbook",
  "template",
  "cheat_sheet",
  "tracker",
  "quick_reference",
] as const;

export type OpportunityFormat = (typeof ALLOWED_FORMATS)[number];

export const SOPHISTICATION_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type SophisticationLevel = (typeof SOPHISTICATION_LEVELS)[number];

export const URGENCY_LEVELS = ["low", "medium", "high"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export interface OpportunitySignalInput {
  id: string;
  source_id?: string | null;
  source_type?: string;
  title: string | null;
  content: string | null;
  url: string | null;
  published_at?: string | null;
  analysis?: {
    audience?: string | null;
    problem?: string | null;
    intent?: string | null;
    urgency?: string | null;
    pdf_relevance?: number | null;
  } | null;
}

export interface OpportunityMarketInput {
  id: string;
  name: string;
  description?: string | null;
  trend?: string | null;
  demandScore: number;
  confidence: number;
  pdfFitScore?: number;
  signals: OpportunitySignalInput[];
}

export interface GeneratedOpportunity {
  id: string;
  marketId: string;
  title: string;
  targetAudience: string;
  problem: string;
  solution: string;
  format: OpportunityFormat;
  priceRange: string;
  sophistication: SophisticationLevel;
  mechanism: string;
  outcome: string;
  urgency: UrgencyLevel;
  opportunityScore: number;
  confidence: number;
  evidence: EvidenceInput[];
}

export interface OpportunityRow {
  id: string;
  market_id: string;
  title: string;
  target_audience: string;
  problem: string;
  solution: string;
  format: string;
  price_range: string;
  opportunity_score: number;
  confidence: number;
  created_at?: string;
}

export interface DiversificationStats {
  totalCount: number;
  audienceCount: number;
  formatCounts: Record<string, number>;
  sophisticationCounts: Record<string, number>;
  urgencyCounts: Record<string, number>;
  priceRanges: string[];
}
