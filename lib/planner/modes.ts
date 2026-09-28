// lib/planner/modes.ts — Pure mode logic: Hunt/Explore market filtering and the Validate report (PRD §27, §48).
// Everything here derives from stored rows; absent data is reported as "not observed", never filled in.

import type { MarketRowData } from "../markets/types.ts";
import type { EvidenceCitation, MarketOverview } from "../search/types.ts";
import { tokenize } from "./parse.ts";
import type { StructuredQuery } from "./types.ts";

/** Same cut as the explorer table's "Low" competition band. */
const LOW_COMPETITION_MAX = 30;
const MAX_CITATIONS = 6;

export interface MarketMatch {
  market: MarketRowData;
  /** Why this market passed each active filter, with the counts behind it. */
  matched: string[];
}

export function filterMarkets(markets: MarketRowData[], q: StructuredQuery): MarketMatch[] {
  const tokens = tokenize([q.niche, q.audience].filter(Boolean).join(" "));
  const out: MarketMatch[] = [];

  for (const m of markets) {
    if (m.evidence_count === 0) continue; // QC Rule 1: no evidence, no result
    const hay = [
      m.name,
      m.description,
      m.top_opportunity?.title,
      m.top_opportunity?.target_audience,
      m.top_opportunity?.format,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matched: string[] = [];

    if (tokens.length > 0) {
      // ponytail: plural-strip stemming only; swap for pgvector similarity if recall matters
      const hits = tokens.filter((t) => hay.includes(t.replace(/s$/, "")));
      if (hits.length === 0) continue;
      matched.push(`matches "${hits.join('", "')}"`);
    }
    if (q.intent === "high") {
      // intent must come from analyzed signals (QC Rule 4), not the score fallback
      if (m.signal_count === 0 || (m.buyer_intent !== "strong" && m.buyer_intent !== "very_strong")) continue;
      matched.push(`buyer intent ${m.buyer_intent.replace("_", " ")} across ${m.signal_count} signals`);
    }
    if (q.competition === "low") {
      if (m.competition_score >= LOW_COMPETITION_MAX) continue;
      matched.push(`competition ${m.competition_score}/100`);
    }
    if (q.formats.length > 0) {
      const hits = q.formats.filter((f) => hay.includes(f));
      if (hits.length === 0) continue;
      matched.push(`format: ${hits.join(", ")}`);
    }
    if (q.trend === "rising") {
      if (m.trend !== "emerging" && m.trend !== "accelerating") continue;
      matched.push(`trend ${m.trend}`);
    } else if (q.trend === "seasonal") {
      if (m.trend !== "seasonal") continue;
      matched.push("trend seasonal");
    }

    out.push({ market: m, matched });
  }

  return out.sort(
    (a, b) => b.market.demand_score * b.market.confidence - a.market.demand_score * a.market.confidence,
  );
}

// ── Validate (PRD §48) ────────────────────────────────────────────────

export const VALIDATION_BLOCKS = [
  "demand",
  "audience",
  "complaints",
  "products",
  "pricing",
  "gaps",
  "risks",
] as const;
export type ValidationBlockKey = (typeof VALIDATION_BLOCKS)[number];

export interface ValidationItem {
  text: string;
  citations: EvidenceCitation[];
}

export interface ValidationBlock {
  title: string;
  observed: boolean;
  summary: string;
  items: ValidationItem[];
}

export interface ValidationReport {
  concept: string;
  confidence: number;
  signalsMatched: number;
  blocks: Record<ValidationBlockKey, ValidationBlock>;
}

function cites(...lists: EvidenceCitation[][]): EvidenceCitation[] {
  const seen = new Set<string>();
  const out: EvidenceCitation[] = [];
  for (const c of lists.flat()) {
    const key = c.id ?? c.url ?? c.claim ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === MAX_CITATIONS) break;
  }
  return out;
}

function notObserved(title: string, summary: string): ValidationBlock {
  return { title, observed: false, summary, items: [] };
}

export function buildValidationReport(concept: string, ov: MarketOverview): ValidationReport {
  const dc = ov.discussionCounts;
  const bi = ov.buyerIntentSignals;
  const pains = ov.pains.value?.items ?? [];
  const mk = ov.marketplaceActivity;
  const gaps = ov.underservedSubmarkets.value?.items ?? [];

  // Demand — counts only (QC Rule 4)
  const demand: ValidationBlock =
    dc.observed || bi.observed
      ? {
          title: "Demand",
          observed: true,
          summary: [
            dc.value ? `${dc.value.total} discussions across ${Object.keys(dc.value.bySource).length} sources` : null,
            bi.value
              ? `${bi.value.totalIntentSignals} buyer-intent signals (${bi.value.veryStrongCount} very strong, ${bi.value.strongCount} strong)`
              : null,
          ]
            .filter(Boolean)
            .join("; "),
          items: (bi.value?.sampleQuotes ?? []).slice(0, 4).map((s) => ({
            text: `“${s.quote}”${s.intentLevel ? ` — ${s.intentLevel.replace("_", " ")} intent` : ""}`,
            citations: [{ url: s.url, source: s.source }],
          })),
        }
      : notObserved("Demand", "No discussions or buyer-intent signals observed for this concept.");
  if (demand.observed && demand.items.length === 0) {
    demand.items = [{ text: demand.summary, citations: cites(dc.evidence, bi.evidence) }];
  }

  // Audience — who is voicing the pains
  const byAudience = new Map<string, { n: number; citations: EvidenceCitation[] }>();
  for (const p of pains) {
    if (!p.audience) continue;
    const a = byAudience.get(p.audience) ?? { n: 0, citations: [] };
    a.n += p.frequency;
    a.citations.push(...p.citations);
    byAudience.set(p.audience, a);
  }
  const audiences = [...byAudience.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 5);
  const audience: ValidationBlock =
    audiences.length > 0
      ? {
          title: "Audience",
          observed: true,
          summary: `${audiences.length} audience segments voice these problems.`,
          items: audiences.map(([name, a]) => ({
            text: `${name} — ${a.n} pain signal${a.n === 1 ? "" : "s"}`,
            citations: cites(a.citations),
          })),
        }
      : notObserved("Audience", "No audience observed in the analyzed signals.");

  const complaints: ValidationBlock =
    pains.length > 0
      ? {
          title: "Complaints",
          observed: true,
          summary: `${pains.length} recurring pain points observed.`,
          items: pains.slice(0, 5).map((p) => ({
            text: `${p.problem} (×${p.frequency}${p.urgency ? `, ${p.urgency} urgency` : ""})`,
            citations: cites(p.citations),
          })),
        }
      : notObserved("Complaints", "No complaints observed in the analyzed signals.");

  const productsList = mk.value?.sampleProducts ?? [];
  const products: ValidationBlock =
    mk.observed && mk.value && mk.value.productsCount > 0
      ? {
          title: "Existing products",
          observed: true,
          summary: `${mk.value.productsCount} products observed on ${Object.entries(mk.value.platforms)
            .map(([p, n]) => `${p} (${n})`)
            .join(", ")}.`,
          items: productsList.slice(0, 5).map((p) => ({
            text: `${p.title} — ${p.platform}${p.price ? `, ${p.price}` : ""}`,
            citations: [{ url: p.url, source: p.platform }],
          })),
        }
      : notObserved("Existing products", "No competing products observed (QC Rule 3: none invented).");

  const priced = productsList.filter((p) => p.price);
  const pricing: ValidationBlock =
    mk.value?.priceRange
      ? {
          title: "Pricing",
          observed: true,
          summary: `Observed price range ${mk.value.priceRange} across ${priced.length} priced listings.`,
          items: priced.slice(0, 5).map((p) => ({
            text: `${p.price} — ${p.title}`,
            citations: [{ url: p.url, source: p.platform }],
          })),
        }
      : notObserved("Pricing", "No priced listings observed.");

  const gapsBlock: ValidationBlock =
    gaps.length > 0
      ? {
          title: "Gaps",
          observed: true,
          summary: `${gaps.length} underserved angles observed.`,
          items: gaps.slice(0, 5).map((g) => ({ text: `${g.name}: ${g.reason}`, citations: cites(g.citations) })),
        }
      : notObserved("Gaps", "No underserved submarkets observed.");

  // Risks — each one derived from a count above, never from opinion
  const risks: ValidationItem[] = [];
  if (ov.matchedSignalsCount < 5) {
    risks.push({
      text: `Thin evidence: only ${ov.matchedSignalsCount} matching signals — treat every block as low confidence (PRD §54).`,
      citations: [],
    });
  }
  const td = ov.trendDirection;
  if (!td.observed || !td.value || td.value.direction === "unknown") {
    risks.push({
      text: "Trend unverifiable: not enough temporal evidence across windows (QC Rule 2).",
      citations: td.evidence,
    });
  } else if (td.value.direction === "declining") {
    risks.push({
      text: `Declining interest${td.value.deltas ? `: ${td.value.deltas}` : ""}.`,
      citations: cites(td.evidence),
    });
  }
  const cd = ov.competitiveDensity.value;
  if (cd?.densityRating === "high") {
    risks.push({
      text: `Crowded: ${cd.competitorsObserved} competitors observed (density high).`,
      citations: cites(ov.competitiveDensity.evidence),
    });
  }
  if (!bi.value || bi.value.totalIntentSignals === 0) {
    risks.push({ text: "No buyer-intent signals observed — willingness to pay is unproven.", citations: [] });
  }
  if (!mk.value || mk.value.productsCount === 0) {
    risks.push({
      text: "No paid products observed — no proof yet that people buy PDFs for this.",
      citations: [],
    });
  }

  return {
    concept,
    confidence: ov.confidence,
    signalsMatched: ov.matchedSignalsCount,
    blocks: {
      demand,
      audience,
      complaints,
      products,
      pricing,
      gaps: gapsBlock,
      risks: {
        title: "Risks",
        observed: true,
        summary:
          risks.length > 0 ? `${risks.length} risks derived from the counts above.` : "No evidence-derived risks flagged.",
        items: risks,
      },
    },
  };
}
