// lib/sources/marketplace-helper.ts — Shared extraction & parsing logic for marketplace adapters.
// Parses title, price, format, rating, reviews, positioning, promises, and seller info from SERP / web results.

import type { CompetitorProduct } from "../competition/types.ts";

export interface ParsedMarketplaceItem {
  title: string;
  seller: string | null;
  url: string | null;
  price: string | null;
  priceNumeric: number | null;
  format: string;
  rating: number | null;
  reviewCount: number | null;
  positioning: string | null;
  promises: string[];
  reviews: string[];
}

export function parsePrice(text?: string | null): { priceStr: string | null; priceNumeric: number | null } {
  if (!text) return { priceStr: null, priceNumeric: null };

  if (/\bfree\b/i.test(text)) {
    return { priceStr: "Free", priceNumeric: 0 };
  }

  // Look for currency symbols followed by numbers: $12.99, £9.99, €15.00, $5
  const match = text.match(/(?:[$£€]|USD\s*|GBP\s*|EUR\s*)(\d+(?:\.\d{1,2})?)/i);
  if (match) {
    const num = parseFloat(match[1]);
    const symbol = text.includes("£") ? "£" : text.includes("€") ? "€" : "$";
    const formatted = num % 1 === 0 ? `${symbol}${num}` : `${symbol}${num.toFixed(2)}`;
    return { priceStr: formatted, priceNumeric: num };
  }

  return { priceStr: null, priceNumeric: null };
}

export function parseRatingAndReviews(text?: string | null): {
  rating: number | null;
  reviewCount: number | null;
} {
  if (!text) return { rating: null, reviewCount: null };

  let rating: number | null = null;
  let reviewCount: number | null = null;

  // Rating: 4.8 or 4.8/5 or 4.8 out of 5 or 4.8 ★
  const ratingMatch = text.match(/(?:Rating:\s*|rated\s+)?([1-5](?:\.[0-9])?)\s*(?:\/5|\s*out of 5|\s*stars|\s*★)?/i);
  if (ratingMatch) {
    const val = parseFloat(ratingMatch[1]);
    if (val >= 1 && val <= 5) {
      rating = val;
    }
  }

  // Reviews: 42 reviews, 1,234 ratings
  const reviewMatch = text.match(/([\d,]+)\s*(?:reviews?|ratings?|customer reviews?)/i);
  if (reviewMatch) {
    const count = parseInt(reviewMatch[1].replace(/,/g, ""), 10);
    if (!isNaN(count)) {
      reviewCount = count;
    }
  }

  return { rating, reviewCount };
}

export function detectProductFormat(text?: string | null): string {
  if (!text) return "guide";
  const lower = text.toLowerCase();

  if (lower.includes("checklist")) return "checklist";
  if (lower.includes("cheat sheet") || lower.includes("cheatsheet")) return "cheat_sheet";
  if (lower.includes("template")) return "template";
  if (lower.includes("workbook")) return "workbook";
  if (lower.includes("planner")) return "planner";
  if (lower.includes("flowchart") || lower.includes("diagnostic tree")) return "checklist";
  if (lower.includes("handbook") || lower.includes("manual")) return "guide";
  if (lower.includes("ebook") || lower.includes("kindle")) return "ebook";
  if (lower.includes("guide")) return "guide";

  return "other";
}

export function extractSeller(platform: string, url?: string | null, text?: string | null): string | null {
  if (url) {
    if (platform === "etsy") {
      // etsy.com/shop/SellerName or etsy.com/listing/... by SellerName
      const shopMatch = url.match(/etsy\.com\/shop\/([a-zA-Z0-9_-]+)/i);
      if (shopMatch) return shopMatch[1];
    } else if (platform === "gumroad") {
      // seller.gumroad.com or gumroad.com/seller
      const subMatch = url.match(/https?:\/\/([a-zA-Z0-9_-]+)\.gumroad\.com/i);
      if (subMatch && subMatch[1] !== "www" && subMatch[1] !== "discover") return subMatch[1];
      const pathMatch = url.match(/gumroad\.com\/([a-zA-Z0-9_-]+)(?:\/|$)/i);
      if (pathMatch && pathMatch[1] !== "l" && pathMatch[1] !== "discover") return pathMatch[1];
    }
  }

  if (text) {
    const byMatch = text.match(/\bby\s+([A-Z][a-zA-Z0-9_.\s-]{2,25})(?:\s+on|\s*[-·|,]|\s*$)/);
    if (byMatch) {
      return byMatch[1].trim();
    }
  }

  return null;
}

export function extractPromisesAndPositioning(
  title: string,
  snippet: string,
): { positioning: string; promises: string[] } {
  const promises: string[] = [];
  const fullText = `${title}. ${snippet}`;

  // Look for actionable action statements or value propositions
  if (/step-by-step/i.test(fullText)) promises.push("Step-by-step diagnostic workflow");
  if (/printable|offline/i.test(fullText)) promises.push("Printable offline quick reference");
  if (/beginner|non-technical|zero experience/i.test(fullText)) promises.push("Beginner-friendly zero-jargon instructions");
  if (/instant download|fast|in minutes/i.test(fullText)) promises.push("Immediate download triage");
  if (/comprehensive|complete|ultimate/i.test(fullText)) promises.push("Comprehensive diagnostic coverage");

  if (promises.length === 0) {
    promises.push("Direct downloadable guidance for hardware & software recovery");
  }

  // Positioning
  let positioning = "General reference manual";
  if (/cheat sheet|one-pager|quick/i.test(fullText)) {
    positioning = "Quick-triage reference sheet";
  } else if (/checklist|flowchart|tree/i.test(fullText)) {
    positioning = "Step-by-step troubleshooting checklist";
  } else if (/workbook|hands-on/i.test(fullText)) {
    positioning = "Interactive diagnostic workbook";
  } else if (/handbook|manual|guide/i.test(fullText)) {
    positioning = "Comprehensive troubleshooting handbook";
  }

  return { positioning, promises };
}

export function extractReviewSnippets(snippet: string): string[] {
  const reviews: string[] = [];
  // Snippets sometimes contain quoted user reviews or feedback sentences
  const quoteMatches = snippet.match(/"([^"]{15,180})"/g);
  if (quoteMatches) {
    for (const q of quoteMatches) {
      reviews.push(q.replace(/^"|"$/g, "").trim());
    }
  }

  // Also check for descriptive sentences that convey user experience
  const sentences = snippet.split(/[.!?]\s+/);
  for (const s of sentences) {
    if (
      /too technical|confusing|hard to follow|missing|wished|helpful|great checklist|lifesaver|clear screenshots/i.test(
        s,
      )
    ) {
      reviews.push(s.trim());
    }
  }

  return reviews.slice(0, 3);
}

export function parseMarketplaceProduct(
  platform: "etsy" | "gumroad" | "amazon_kdp" | "web",
  raw: { title?: string; link?: string; snippet?: string },
): CompetitorProduct {
  const title = (raw.title || "Untitled Product").replace(/\s*[-|·]\s*(?:Etsy|Gumroad|Amazon(?:\.com)?).*$/i, "").trim();
  const url = (raw.link || "").trim() || null;
  const snippet = raw.snippet || "";

  const { priceStr, priceNumeric } = parsePrice(snippet + " " + title);
  const { rating, reviewCount } = parseRatingAndReviews(snippet);
  const format = detectProductFormat(title + " " + snippet);
  const seller = extractSeller(platform, url, snippet);
  const { positioning, promises } = extractPromisesAndPositioning(title, snippet);
  const reviews = extractReviewSnippets(snippet);

  return {
    platform,
    title,
    seller,
    url,
    price: priceStr,
    priceNumeric,
    format,
    rating,
    reviewCount,
    positioning,
    promises,
    reviews,
  };
}
