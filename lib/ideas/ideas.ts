// lib/ideas/ideas.ts — per-phrase "quick ideas" from stored signals (Phase 3 Part 3.6).
// Method from the PDFMinter teardown (docs/research/2026-10-24-pdfminter-teardown.md),
// re-derived under PDF Lab's evidence contract:
//   - demand cites engine count + best position (QC Rule 4);
//   - a trend label exists only when Google Trends lists the phrase as rising (QC Rule 2),
//     otherwise it is null ("not observed"), never a default "evergreen";
//   - specificity describes the phrase only. It is NOT a competition claim (QC Rule 3).
// Part 3.7: Serper PAA / related-search phrases count like suggestions (demand cites the blocks),
// plus a not-professional-advice flag and a "Timely" tag that is never a trend label (QC Rule 2).
// Pure functions over MarketSignal engagement fields; no adapter imports (08-ADAPTERS rule 1).

import type { MarketSignal } from "../sources/types.ts";

export type IdeaFormat = "Guide" | "Checklist" | "Planner" | "Worksheet" | "Cheat sheet" | "Ebook" | "Report";
export type IdeaIntent = "howto" | "compare" | "buyer" | "question" | "info";
export type IdeaTrend = "breakout" | "rising" | null;
export type AdviceArea = "health" | "money" | "legal";

export interface IdeaEvidence {
  source: string;
  source_id: string;
  url: string | null;
  title: string | null;
}

export interface QuickIdea {
  id: string;
  phrase: string;
  title: string;
  format: IdeaFormat;
  intent: IdeaIntent;
  isQuestion: boolean;
  demand: number;
  demandBasis: string;
  fit: number;
  trend: IdeaTrend;
  trendBasis: string | null;
  effort: "Easy" | "Medium" | "Hard";
  interest: "High" | "Medium" | "Low";
  specificity: "broad" | "mid" | "long_tail";
  opportunity: number;
  /** 0-1: independent sources behind the idea (each engine, plus Google Trends) out of 5. */
  confidence: number;
  /** Where the phrase was observed: suggest engines, or Serper blocks `paa` / `related`. */
  engines: string[];
  /** Health / money / legal topic: the card shows a badge and the brief (3.10) a not-advice note. */
  advice: AdviceArea | null;
  /** Names the current or next year: a dated phrase that may need a yearly refresh. Not a trend. */
  timely: boolean;
  evidence: IdeaEvidence[];
}

export interface TopicTrendLine {
  source: string;
  basis: string; // human-readable windows + counts
  direction: string;
  changePct: number | null;
  evidence: IdeaEvidence;
}

export interface IdeasResult {
  seed: string;
  ideas: QuickIdea[];
  topic: TopicTrendLine[];
  stats: { ideas: number; questions: number; rising: number; avgDemand: number };
}

const QWORD = /^(how|what|why|when|where|who|which|can|is|are|does|do|should|will|would|could)\b/;
const STOP = new Set(
  "a an the and or of to for in on with how what why is are can do does my your you i at by vs best top from it be as get this that".split(" "),
);

/** Lower-case content words with a light plural stem ("plans" → "plan"). */
export function tokens(s: string): string[] {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]).size;
  return union ? [...A].filter((t) => B.has(t)).length / union : 0;
}

export function isQuestion(phrase: string): boolean {
  return QWORD.test(phrase.toLowerCase());
}

const FORMAT_RULES: Array<[IdeaFormat, RegExp]> = [
  ["Checklist", /\b(checklist|check list|list|packing|essentials|to do|todo)\b/],
  ["Planner", /\b(planner|plans?|schedule|routine|calendar|tracker|log)\b/],
  ["Worksheet", /\b(worksheets?|templates?|workbook|journal|prompts|printables?)\b/],
  ["Cheat sheet", /\b(cheat ?sheet|cheat|shortcuts|formulas|chart|symbols|glossary)\b/],
  ["Ebook", /\b(recipes|ideas|e?book|handbook|bible|complete|101)\b/],
  ["Report", /\b(statistics|stats|trends|market|salary|salaries|report|data|average cost)\b/],
];

export function classifyFormat(phrase: string): IdeaFormat {
  const p = phrase.toLowerCase();
  return FORMAT_RULES.find(([, re]) => re.test(p))?.[0] ?? "Guide";
}

export function classifyIntent(phrase: string, engines: string[]): IdeaIntent {
  const p = phrase.toLowerCase();
  if (/\bhow to\b/.test(p)) return "howto";
  if (/\b(vs|versus|compared|alternatives?)\b/.test(p)) return "compare";
  if (/\b(best|top|buy|cheap|price|cost|reviews?|deals?|discount|kit|book|apps?|software|tools?)\b/.test(p)) return "buyer";
  if (isQuestion(p)) return "question";
  return engines.includes("amazon") ? "buyer" : "info";
}

/** 0-100: how well the phrase works as a PDF. Navigational and tool searches score low. */
export function pdfFit(phrase: string, format: IdeaFormat, intent: IdeaIntent): number {
  const p = phrase.toLowerCase();
  let fit = 50;
  if (intent === "howto" || isQuestion(p)) fit += 20;
  if (format !== "Guide") fit += 15;
  if (/\b(beginners?|step by step|for (moms|students|seniors|kids|teens|men|women|couples|families))\b/.test(p)) fit += 10;
  if (/\b(apps?|software|calculator|login|sign in|near me|customer service|phone number|website|download|stock|net worth|meaning|movie|song|lyrics)\b/.test(p)) fit -= 35;
  return Math.max(0, Math.min(100, fit));
}

const EFFORT: Record<IdeaFormat, QuickIdea["effort"]> = {
  Checklist: "Easy",
  "Cheat sheet": "Easy",
  Planner: "Medium",
  Worksheet: "Medium",
  Guide: "Medium",
  Ebook: "Hard",
  Report: "Hard",
};

export function specificity(phrase: string, seed: string): QuickIdea["specificity"] {
  const seedTokens = new Set(tokens(seed));
  const core = tokens(phrase).filter((t) => !seedTokens.has(t)).length;
  if (isQuestion(phrase) || core >= 3 || phrase.trim().split(/\s+/).length >= 6) return "long_tail";
  return core === 2 ? "mid" : "broad";
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) =>
    ["a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "with", "vs"].includes(a + b) ? a + b : a.toUpperCase() + b,
  ).replace(/^./, (c) => c.toUpperCase());
}

export function ideaTitle(phrase: string, format: IdeaFormat, intent: IdeaIntent): string {
  const p = phrase.trim().replace(/\?+$/, "");
  const T = titleCase(p);
  if (intent === "howto") return `${titleCase(p.replace(/^how to\s+/i, "How to "))}: A Step-by-Step Guide`;
  if (format === "Guide" && isQuestion(p)) return `${p.charAt(0).toUpperCase()}${p.slice(1)}? A Plain-English Guide`;
  if (format === "Guide" && /^(best|top)\b/i.test(p)) return `${T}: A Buyer's Guide`;
  switch (format) {
    case "Checklist":
      return /checklist/i.test(p) ? `The ${T}` : `The ${T} Checklist`;
    case "Planner":
      return /planner/i.test(p) ? `The ${T}` : `${T}: A Ready-to-Use Planner`;
    case "Worksheet":
      return /worksheets?|workbook/i.test(p) ? `The ${T}` : `${T}: Fill-In Worksheets`;
    case "Cheat sheet":
      return /cheat/i.test(p) ? T : `${T} Cheat Sheet`;
    case "Ebook":
      return `${titleCase(p.replace(/\s+(e?books?|handbooks?)$/i, ""))}: The Complete Handbook`;
    case "Report":
      return `${T}: The Data Report`;
    default:
      return `${T}: The Beginner's Guide`;
  }
}

// shortcut: hand-written keyword list, misses synonyms and other languages; replace with a reviewed list or classifier when briefs ship (3.10).
const ADVICE_RULES: Array<[AdviceArea, RegExp]> = [
  ["health", /\b(diets?|keto|fasting|weight loss|calories|nutrition|anxiety|depression|adhd|autism|diabetes|pregnan(t|cy)|postpartum|symptoms?|medications?|medicines?|supplements?|vitamins?|therapy|mental health|blood pressure|cholesterol|disease|cancer|injur(y|ies)|pain relief|insomnia|fertility|breastfeeding|weaning)\b/],
  ["money", /\b(money|financ(e|es|ial)|budget(s|ing)?|debts?|credit (score|cards?|report)|loans?|mortgages?|invest(ing|ment|ments)?|stocks?|crypto|retirement|401k|ira|tax(es)?|savings|saving money|insurance|bankruptcy|personal finance)\b/],
  ["legal", /\b(legal|laws?|lawyers?|attorneys?|contracts?|divorce|custody|last will|estate planning|power of attorney|visas?|immigration|lawsuits?|sue|copyright|trademarks?|llc|tenant rights|eviction)\b/],
];

export function adviceFlag(phrase: string): AdviceArea | null {
  const p = phrase.toLowerCase();
  return ADVICE_RULES.find(([, re]) => re.test(p))?.[0] ?? null;
}

/** True when the phrase names the current or next calendar year (UTC), e.g. "budget planner 2027". */
export function isTimely(phrase: string, now: Date = new Date()): boolean {
  const year = now.getUTCFullYear();
  return (phrase.match(/\b20\d\d\b/g) ?? []).some((y) => Number(y) === year || Number(y) === year + 1);
}

const BLOCK_LABEL: Record<string, string> = { paa: "People also ask", related: "Related searches" };

/**
 * Demand 0-100 from suggestion evidence: share of answering engines that suggested the
 * phrase, and its best list position.
 * shortcut: weights 0.7/0.3 are uncalibrated; refit on the user's PDFMinter CSV exports (DEC-008).
 */
export function suggestionDemand(engineCount: number, enginesOk: number, bestPosition: number): number {
  const share = enginesOk > 0 ? Math.min(1, engineCount / enginesOk) : 0;
  const rank = Math.max(0, 1 - bestPosition / 10);
  return Math.round(100 * (0.7 * share + 0.3 * rank));
}

/** shortcut: uncalibrated blend (demand 55%, fit 45%, +10 rising, +15 breakout); refit with DEC-008 CSVs. */
export function opportunity(demand: number, fit: number, trend: IdeaTrend): number {
  const bonus = trend === "breakout" ? 15 : trend === "rising" ? 10 : 0;
  return Math.min(100, Math.round(0.55 * demand + 0.45 * fit) + bonus);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function ev(s: MarketSignal): IdeaEvidence {
  return { source: s.source, source_id: s.source_id, url: s.url, title: s.title };
}

interface PhraseAcc {
  phrase: string;
  engines: string[];
  demand: number;
  demandBasis: string;
  trend: IdeaTrend;
  trendBasis: string | null;
  evidence: IdeaEvidence[];
}

/** Build ranked quick ideas for one seed from the signals its ingest just stored. */
export function buildIdeas(seed: string, signals: MarketSignal[], now: Date = new Date()): IdeasResult {
  const seedKey = seed.trim().toLowerCase();
  const byPhrase = new Map<string, PhraseAcc>();
  const topic: TopicTrendLine[] = [];
  const get = (phrase: string) => {
    const key = phrase.trim().toLowerCase();
    let acc = byPhrase.get(key);
    if (!acc) {
      acc = { phrase: key, engines: [], demand: 0, demandBasis: "not observed in search suggestions", trend: null, trendBasis: null, evidence: [] };
      byPhrase.set(key, acc);
    }
    return acc;
  };

  for (const s of signals) {
    const e = s.engagement;
    const phrase = str(e.phrase);
    const related = str(e.related_query);
    if (phrase) {
      // Serper phrase rows carry `serp_blocks`; suggestion rows carry `engines`. Same demand formula.
      const blocks = str(e.serp_blocks);
      const engines = (blocks ?? str(e.engines) ?? "").split(",").filter(Boolean);
      const count = num(blocks ? e.block_count : e.engine_count) ?? engines.length;
      const ok = num(blocks ? e.blocks_total : e.engines_ok) ?? count;
      const best = num(e.best_position) ?? 9;
      const acc = get(phrase);
      const d = suggestionDemand(count, ok, best);
      acc.engines = [...new Set([...acc.engines, ...engines])];
      if (d >= acc.demand) {
        acc.demand = d;
        acc.demandBasis = blocks
          ? `in ${count} of ${ok} Google result blocks (${engines.map((b) => BLOCK_LABEL[b] ?? b).join(", ")}), best position #${best + 1}`
          : `suggested by ${count} of ${ok} engines, best position #${best + 1}`;
      }
      acc.evidence.push(ev(s));
    } else if (related) {
      const value = num(e.interest_value) ?? 0;
      const acc = get(related);
      acc.evidence.push(ev(s));
      if (e.rising === true) {
        // Google labels ≥5000% growth "Breakout" and reports it as value 5000+.
        acc.trend = value >= 5000 ? "breakout" : "rising";
        acc.trendBasis = `Google Trends rising related query (${value >= 5000 ? "breakout, 5000%+" : `+${value}%`} vs the previous period)`;
      } else if (value > acc.demand) {
        acc.demand = value;
        acc.demandBasis = `Google Trends top related query, relative interest ${value}/100`;
      }
    } else if (s.source === "wikipedia" || num(e.avg_interest) !== null) {
      const changePct = num(e.change_pct);
      topic.push({
        source: s.source,
        basis:
          s.source === "wikipedia"
            ? `Wikipedia "${str(e.article)}": ${num(e.recent_daily_avg)}/day over the last ${num(e.recent_days)} days vs ${num(e.prior_daily_avg)}/day over the prior ${num(e.prior_days)}`
            : `Google Trends ${num(e.window_days)}-day interest, average ${num(e.avg_interest)}/100 over ${num(e.points)} points`,
        direction: str(e.direction) ?? "unknown",
        changePct,
        evidence: ev(s),
      });
    }
  }

  const ideas: QuickIdea[] = [...byPhrase.values()]
    .filter((a) => a.phrase !== seedKey)
    .map((a) => {
      const format = classifyFormat(a.phrase);
      const intent = classifyIntent(a.phrase, a.engines);
      const fit = pdfFit(a.phrase, format, intent);
      return {
        id: a.evidence[0].source_id,
        phrase: a.phrase,
        title: ideaTitle(a.phrase, format, intent),
        format,
        intent,
        isQuestion: isQuestion(a.phrase),
        demand: a.demand,
        demandBasis: a.demandBasis,
        fit,
        trend: a.trend,
        trendBasis: a.trendBasis,
        effort: EFFORT[format],
        interest: a.demand >= 65 ? "High" : a.demand >= 35 ? "Medium" : "Low",
        specificity: specificity(a.phrase, seed),
        opportunity: opportunity(a.demand, fit, a.trend),
        confidence: Math.min(1, (a.engines.length + (a.evidence.some((x) => x.source === "gtrends") ? 1 : 0)) / 5),
        engines: a.engines,
        advice: adviceFlag(a.phrase),
        timely: isTimely(a.phrase, now),
        evidence: a.evidence,
      } satisfies QuickIdea;
    })
    .sort((x, y) => y.opportunity - x.opportunity || y.demand - x.demand || x.phrase.localeCompare(y.phrase));

  return {
    seed: seedKey,
    ideas,
    topic,
    stats: {
      ideas: ideas.length,
      questions: ideas.filter((i) => i.isQuestion).length,
      rising: ideas.filter((i) => i.trend !== null).length,
      avgDemand: ideas.length ? Math.round(ideas.reduce((a, i) => a + i.demand, 0) / ideas.length) : 0,
    },
  };
}
