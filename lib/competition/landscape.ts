// lib/competition/landscape.ts — Landscape clustering per PRD §20.
// Rule: Percentages ONLY from collected data, strictly summing to 100% (QC Rule 3 & 4).

import type { CompetitorProduct, LandscapeAnalysis, LandscapeShare } from "./types.ts";

/**
 * Normalizes an array of counts into percentages that sum to exactly 100.0%.
 * Uses largest remainder method to ensure no rounding drift (e.g., 33.3 + 33.3 + 33.3 = 99.9).
 */
function normalizePercentages(items: Array<{ label: string; count: number }>, total: number): LandscapeShare[] {
  if (total === 0 || items.length === 0) return [];

  // Calculate raw percentages rounded to 1 decimal place
  let sum = 0;
  const withRaw = items.map((item) => {
    const rawPct = (item.count / total) * 100;
    const rounded = Math.round(rawPct * 10) / 10;
    sum += rounded;
    return {
      label: item.label,
      count: item.count,
      percentage: rounded,
      remainder: rawPct - rounded,
    };
  });

  // Distribute rounding remainder across top-N items by largest remainder (M-4)
  const diff = Math.round((100.0 - sum) * 10) / 10;
  if (diff !== 0 && withRaw.length > 0) {
    const sorted = [...withRaw].sort((a, b) => b.remainder - a.remainder);
    const step = diff > 0 ? 0.1 : -0.1;
    let remaining = Math.round(Math.abs(diff) * 10);
    for (let i = 0; i < sorted.length && remaining > 0; i++) {
      sorted[i].percentage = Math.round((sorted[i].percentage + step) * 10) / 10;
      remaining--;
    }
  }

  return withRaw.map(({ label, count, percentage }) => ({
    label,
    count,
    percentage,
  }));
}

export function calculateLandscape(competitors: CompetitorProduct[]): LandscapeAnalysis {
  const totalObserved = competitors.length;

  if (totalObserved === 0) {
    return {
      totalObserved: 0,
      platformShares: [],
      formatShares: [],
      priceTierShares: [],
      averagePrice: null,
      averageRating: null,
    };
  }

  // 1. Platform distribution
  const platformCounts = new Map<string, number>();
  for (const c of competitors) {
    const p = c.platform || "web";
    platformCounts.set(p, (platformCounts.get(p) || 0) + 1);
  }
  const platformItems = Array.from(platformCounts.entries()).map(([label, count]) => ({
    label,
    count,
  }));
  const platformShares = normalizePercentages(platformItems, totalObserved);

  // 2. Format distribution
  const formatCounts = new Map<string, number>();
  for (const c of competitors) {
    const f = c.format || "other";
    formatCounts.set(f, (formatCounts.get(f) || 0) + 1);
  }
  const formatItems = Array.from(formatCounts.entries()).map(([label, count]) => ({
    label,
    count,
  }));
  const formatShares = normalizePercentages(formatItems, totalObserved);

  // 3. Price Tier distribution
  const priceTierCounts = new Map<string, number>([
    ["free", 0],
    ["budget (<$10)", 0],
    ["mid_tier ($10-$25)", 0],
    ["premium (>$25)", 0],
    ["unspecified", 0],
  ]);

  let sumPrice = 0;
  let pricedCount = 0;

  for (const c of competitors) {
    if (c.priceNumeric !== null && c.priceNumeric !== undefined) {
      sumPrice += c.priceNumeric;
      pricedCount++;
      if (c.priceNumeric === 0) {
        priceTierCounts.set("free", (priceTierCounts.get("free") || 0) + 1);
      } else if (c.priceNumeric <= 10) {
        priceTierCounts.set("budget (<$10)", (priceTierCounts.get("budget (<$10)") || 0) + 1);
      } else if (c.priceNumeric <= 25) {
        priceTierCounts.set("mid_tier ($10-$25)", (priceTierCounts.get("mid_tier ($10-$25)") || 0) + 1);
      } else {
        priceTierCounts.set("premium (>$25)", (priceTierCounts.get("premium (>$25)") || 0) + 1);
      }
    } else {
      priceTierCounts.set("unspecified", (priceTierCounts.get("unspecified") || 0) + 1);
    }
  }

  const priceItems = Array.from(priceTierCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));
  const priceTierShares = normalizePercentages(priceItems, totalObserved);

  // 4. Rating metrics
  let sumRating = 0;
  let ratedCount = 0;
  for (const c of competitors) {
    if (c.rating !== null && c.rating !== undefined && c.rating > 0) {
      sumRating += c.rating;
      ratedCount++;
    }
  }

  const averagePrice = pricedCount > 0 ? Math.round((sumPrice / pricedCount) * 100) / 100 : null;
  const averageRating = ratedCount > 0 ? Math.round((sumRating / ratedCount) * 10) / 10 : null;

  return {
    totalObserved,
    platformShares,
    formatShares,
    priceTierShares,
    averagePrice,
    averageRating,
  };
}
