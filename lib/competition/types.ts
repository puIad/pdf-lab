// lib/competition/types.ts — Competition analysis, landscape clustering & review mining types.
// Specifications: docs/04-SCHEMA.md, docs/05-PIPELINE-SCORING.md (PRD §20, §21, §53 Rule 3).

export interface CompetitorProduct {
  id?: string;
  marketId?: string;
  platform: "etsy" | "gumroad" | "amazon_kdp" | "web" | string;
  title: string;
  seller?: string | null;
  url: string | null;
  price: string | null;
  priceNumeric?: number | null;
  format: string; // checklist | guide | template | workbook | ebook | planner | cheat_sheet | other
  rating: number | null;
  reviewCount: number | null;
  positioning?: string | null;
  promises?: string[];
  reviews?: string[];
}

export interface LandscapeShare {
  label: string;
  count: number;
  percentage: number; // Percentages strictly summing to 100% of observed rows (PRD §20)
}

export interface LandscapeAnalysis {
  totalObserved: number;
  platformShares: LandscapeShare[];
  formatShares: LandscapeShare[];
  priceTierShares: LandscapeShare[];
  averagePrice?: number | null;
  averageRating?: number | null;
}

export interface QuotedReviewExcerpt {
  quote: string;
  source: string;
  url?: string | null;
  sentiment?: "dislike" | "missing" | "confusing" | "request" | "like";
}

export interface ProductGap {
  id: string;
  title: string;
  category:
    | "too_technical"
    | "missing_feature"
    | "format_friction"
    | "poor_quality"
    | "outdated"
    | "overpriced"
    | "offline_access"
    | "confusing"
    | "other";
  summary: string;
  opportunityTranslation: string; // Plain-English opportunity (PRD §21, e.g. "too technical" -> plain-English opportunity)
  reviewExcerpts: QuotedReviewExcerpt[]; // >=1 gap traces to quoted review excerpts (Acceptance Criteria)
}

export interface MinedReviewCategories {
  likes: string[];
  dislikes: string[];
  missing: string[];
  confusing: string[];
  requests: string[];
}

export interface CompetitionAnalysisResult {
  competitors: CompetitorProduct[];
  landscape: LandscapeAnalysis;
  reviewMining: MinedReviewCategories;
  productGaps: ProductGap[];
}
