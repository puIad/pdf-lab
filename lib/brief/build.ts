// lib/brief/build.ts — assemble a build-ready brief from cited inputs (Phase 3 Part 3.10).
// Pure: the loaders (load.ts) read the DB, this file applies fixed rules. Every fact keeps its cites;
// the outline, listing copy and bonus angles are rule-based suggestions built from cited phrases.

import { adviceFlag, classifyFormat, jaccard, tokens, type IdeaFormat } from "../ideas/ideas.ts";
import { headingFrom, suggestOutline } from "../ideas/outline.ts";
import { parsePriceText } from "../competition/check.ts";
import type { ValidationVerdict } from "../planner/verdict.ts";
import { etsyTags, etsyTitle } from "./etsy.ts";
import type { Brief, BriefAiNote, BriefCite, BriefFact, BriefMarketplace, BriefSource } from "./types.ts";

export interface BriefPhrase {
  phrase: string;
  opportunity: number;
  cites: BriefCite[];
}

export interface BriefPrice {
  price: string;
  cite: BriefCite;
}

export interface BriefInput {
  source: BriefSource;
  title: string;
  format: IdeaFormat;
  /** The phrase the product answers: the idea itself, or the phrase / market a Deep opportunity came from. */
  mainPhrase: string;
  mainCites: BriefCite[];
  promise: BriefFact;
  audience: BriefFact | null;
  /** Other observed phrases: keywords, outline headings, bonus angles. */
  related: BriefPhrase[];
  /** Verbatim buyer language. */
  quotes: BriefFact[];
  /** Observed marketplace counts; null when no competition was observed or checked. */
  competition: { marketplaces: BriefMarketplace[]; cites: BriefCite[] } | null;
  prices: BriefPrice[];
  /** Review gaps or recurring complaints, already cited. */
  gaps: BriefFact[];
  adviceText: string;
  verdict: ValidationVerdict | null;
  notes?: Record<string, BriefAiNote>;
  now?: Date;
}

const MAX_KEYWORDS = 15;
const QUOTE_MAX = 220;
const MAX_BONUS_PHRASES = 4;
const MAX_BONUS_GAPS = 3;
const ADDON_FORMATS = new Set<IdeaFormat>(["Checklist", "Planner", "Worksheet", "Cheat sheet"]);

const ADVICE_NOTE: Record<string, string> = {
  health:
    "Health topic: state in the product and the listing that it is general information, not medical advice, and that readers should consult a qualified professional.",
  money:
    "Money topic: state in the product and the listing that it is general information, not financial advice, and that readers should consult a qualified professional.",
  legal:
    "Legal topic: state in the product and the listing that it is general information, not legal advice, and that readers should consult a qualified lawyer.",
};

function money(v: number, cur: string): string {
  return `${cur}${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/** Observed price range of paid listings in the most common currency, cited to those listings. */
export function priceAnchor(prices: BriefPrice[]): BriefFact | null {
  const parsed = prices.map((p) => ({ ...p, v: parsePriceText(p.price) })).filter((p) => p.v !== null);
  const free = parsed.filter((p) => p.v!.value === 0);
  const paid = parsed.filter((p) => p.v!.value > 0);
  if (paid.length === 0) {
    return free.length ? { text: `${free.length} free listing${free.length === 1 ? "" : "s"} observed, no paid price observed`, cites: free.map((p) => p.cite) } : null;
  }
  const byCur = new Map<string, typeof paid>();
  for (const p of paid) {
    const c = p.v!.currency ?? "";
    byCur.set(c, [...(byCur.get(c) ?? []), p]);
  }
  const [cur, rows] = [...byCur.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const vals = rows.map((p) => p.v!.value).sort((a, b) => a - b);
  const mid = vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  const other = paid.length - rows.length;
  return {
    text:
      `Observed ${money(vals[0], cur)} to ${money(vals.at(-1)!, cur)} across ${rows.length} priced listing${rows.length === 1 ? "" : "s"} (median ${money(mid, cur)})` +
      (free.length ? `, plus ${free.length} free` : "") +
      (other ? `; ${other} more in other currencies` : ""),
    cites: [...rows, ...free].map((p) => p.cite),
  };
}

/** A verbatim slice: the first sentence or 220 characters of stored text, cut at a word. */
export function verbatim(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const sentence = t.match(/^.{20,}?[.!?](\s|$)/)?.[0]?.trim() ?? t;
  return sentence.length <= QUOTE_MAX ? sentence : `${sentence.slice(0, QUOTE_MAX).replace(/\s+\S*$/, "")}…`;
}

export function phraseKey(phrase: string): string {
  return phrase.toLowerCase().replace(/[^\p{L}\p{Nd}]+/gu, " ").trim();
}

export function buildBrief(input: BriefInput): Brief {
  const main = tokens(input.mainPhrase);
  // "what is budgeting" and "what is budgeting?" are one search: keep the first (strongest) spelling.
  const seen = new Set([phraseKey(input.mainPhrase)]);
  const others = input.related.filter((r) => {
    const k = phraseKey(r.phrase);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const ranked = others
    .map((r) => ({ ...r, score: r.opportunity + 45 * jaccard(tokens(r.phrase), main) }))
    .sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase));

  const headings = suggestOutline({ phrase: input.mainPhrase, format: input.format, related: others });
  const outline = headings.map((heading) => ({
    heading,
    fromPhrase: others.find((r) => headingFrom(r.phrase) === heading)?.phrase ?? null,
  }));

  const keywords: BriefFact[] = [
    { text: input.mainPhrase, cites: input.mainCites },
    ...ranked.slice(0, MAX_KEYWORDS - 1).map((r) => ({ text: r.phrase, cites: r.cites })),
  ].filter((k) => k.cites.length > 0);

  let whereToSell: Brief["whereToSell"] = null;
  if (input.competition) {
    const { marketplaces, cites } = input.competition;
    const seen = marketplaces.filter((m) => m.listings > 0);
    whereToSell = {
      marketplaces,
      fact: {
        text: seen.length
          ? `Competitors observed on ${seen.map((m) => `${m.label} (${m.listings} listing${m.listings === 1 ? "" : "s"}, ${m.withReviews} showing reviews)`).join(", ")}`
          : `0 listings observed on ${marketplaces.map((m) => m.label).join(", ")}`,
        cites,
      },
    };
  }

  const bonusAngles: BriefFact[] = [
    ...ranked
      .map((r) => ({ r, f: classifyFormat(r.phrase) }))
      .filter(({ f }) => ADDON_FORMATS.has(f) && f !== input.format)
      .slice(0, MAX_BONUS_PHRASES)
      .map(({ r, f }) => ({ text: `Add-on ${f.toLowerCase()} from the search "${r.phrase}"`, cites: r.cites })),
    ...input.gaps.slice(0, MAX_BONUS_GAPS).map((g) => ({ text: `Bonus that answers an observed gap: ${g.text}`, cites: g.cites })),
  ];

  const tagWords = keywords.map((k) => k.text);
  const area = adviceFlag(input.adviceText);

  return {
    source: input.source,
    title: input.title,
    format: input.format,
    promise: input.promise,
    audience: input.audience,
    outline,
    buyerLanguage: input.quotes.filter((q) => q.cites.length > 0),
    keywords,
    whereToSell,
    priceAnchor: priceAnchor(input.prices),
    listing: { etsyTitle: etsyTitle(tagWords), etsyTags: etsyTags(tagWords) },
    bonusAngles: bonusAngles.filter((b) => b.cites.length > 0),
    adviceNote: area ? ADVICE_NOTE[area] : null,
    verdict: input.verdict,
    notes: input.notes ?? {},
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Every cite in the brief by id: what AI notes may point at. */
export function briefCites(brief: Brief): Map<string, BriefCite> {
  const facts = [
    brief.promise,
    brief.audience,
    ...brief.buyerLanguage,
    ...brief.keywords,
    brief.whereToSell?.fact ?? null,
    brief.priceAnchor,
    ...brief.bonusAngles,
  ].filter((f): f is BriefFact => f !== null);
  const out = new Map<string, BriefCite>();
  for (const f of facts) for (const c of f.cites) if (!out.has(c.id)) out.set(c.id, c);
  return out;
}

/** Keep only notes whose key exists and whose cites all belong to this brief (client-sent notes on export). */
export function acceptNotes(brief: Brief, notes: unknown): Record<string, BriefAiNote> {
  if (!notes || typeof notes !== "object") return {};
  const keys = new Set([...brief.outline.map((s) => s.heading), "description"]);
  const ids = briefCites(brief);
  const out: Record<string, BriefAiNote> = {};
  for (const [k, v] of Object.entries(notes as Record<string, unknown>)) {
    const n = v as Partial<BriefAiNote> | null;
    if (!keys.has(k) || !n || typeof n.text !== "string" || !n.text.trim() || n.text.length > 2000) continue;
    if (!Array.isArray(n.citeIds) || n.citeIds.length === 0 || !n.citeIds.every((id) => typeof id === "string" && ids.has(id))) continue;
    out[k] = {
      text: n.text.trim(),
      citeIds: n.citeIds,
      provider: typeof n.provider === "string" ? n.provider.slice(0, 60) : "unknown",
      model: typeof n.model === "string" ? n.model.slice(0, 120) : "unknown",
    };
  }
  return out;
}
