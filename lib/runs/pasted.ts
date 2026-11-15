// lib/runs/pasted.ts — Deep runs analysed by a model outside PDF Lab (Part 6.15, DEC-015).
// PDF Lab collects the signals and writes ONE prompt. The user pastes it into a chat model
// (Gemini online), then pastes the JSON reply back. PDF Lab validates every item on its own and
// finishes the run with no model call of its own. The model only ever sees stored signal text
// (06-EVIDENCE-CONTRACT), and its market names replace embedding-based clustering.

import { FIELD_RULES, GROUNDING_RULE, validateExtraction, type ExtractionResult } from "../ai/extraction.ts";
import { extractJsonSlice } from "../ai/router.ts";

export const PASTE_PROMPT_VERSION = "extract-v3-paste";
/** Characters of one signal's text in the prompt. */
const PASTE_TEXT = 1000;
const MAX_MARKET_NAME = 80;
/** The market name the model gives a signal that names no problem within the topic. */
export const NO_MARKET = "none";

export interface PromptSignal {
  id: string;
  title: string | null;
  content: string | null;
}

const signalText = (s: PromptSignal): string =>
  [s.title, s.content].map((t) => (t ?? "").trim()).filter(Boolean).join("\n").slice(0, PASTE_TEXT);

/**
 * The signals that go into the prompt, in a fixed order (by id), without empty ones. Both halves
 * of a run call this, so [n] in the prompt and "n" in the reply always mean the same row.
 */
export function promptSignals<T extends PromptSignal>(signals: T[]): T[] {
  return signals.filter((s) => signalText(s).length > 0).sort((a, b) => a.id.localeCompare(b.id));
}

/** The text the user copies into the chat model. `signals` must come from `promptSignals`. */
export function buildPastePrompt(seed: string, signals: PromptSignal[]): string {
  const body = signals.map((s, i) => `[${i + 1}]\n${signalText(s)}`).join("\n\n---\n\n");
  return `You are analysing stored market-research signals for a PDF-product research engine. The topic is "${seed}". Below are ${signals.length} signals (forum posts, search trends, article snippets), each numbered like [1], [2].

Reply with ONE JSON object and nothing else, in a code block: {"items": [...]} with exactly one item per signal, in the same order. Each item has EXACTLY these keys:
- "n": the signal's number, copied from its [n] label.
${FIELD_RULES}
- "market": a short name (2 to 5 words) for the problem area this signal belongs to. Signals about the same problem MUST get exactly the same name, letter for letter, so they group into one market. A signal that fits no other gets its own name. Never use the bare topic as a name. If a signal names no problem within the topic (an unrelated search, or a bare measurement of interest), use exactly "${NO_MARKET}".

Judge every signal from ITS OWN text only: never carry an audience, a problem or a detail from one signal into another. Do not search the web and do not add signals.
${GROUNDING_RULE}

Signals:

${body}`;
}

export interface PastedItem extends ExtractionResult {
  market: string;
}

export interface ParsedReply {
  /** Valid items, keyed by signal number (1-based). */
  items: Map<number, PastedItem>;
  /** Items that were present but wrong, with the reason. */
  problems: Array<{ n: number; reason: string }>;
  /** Signal numbers the reply left out. */
  missing: number[];
}

/**
 * Reads what the user pasted: a JSON object, possibly inside a code block or with prose around
 * it. Each item is validated alone; a bad one is listed, never guessed. Throws only when no JSON
 * with an "items" array can be found at all.
 */
export function parsePastedReply(text: string, count: number): ParsedReply {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonSlice(text));
  } catch {
    throw new Error('The pasted text is not JSON. Paste the model\'s whole reply: a {"items": [...]} object.');
  }
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) throw new Error('The pasted JSON has no "items" array.');

  const items = new Map<number, PastedItem>();
  const problems: ParsedReply["problems"] = [];
  for (const entry of list) {
    const n = Number((entry as { n?: unknown } | null)?.n);
    if (!Number.isInteger(n) || n < 1 || n > count) continue; // a number outside the prompt: ignored
    if (items.has(n)) continue; // first item for a number wins
    try {
      const analysis = validateExtraction(entry);
      const market = typeof (entry as { market?: unknown }).market === "string" ? (entry as { market: string }).market.trim().replace(/\s+/g, " ") : "";
      if (!market) throw new Error('"market" must be a non-empty string');
      if (market.length > MAX_MARKET_NAME) throw new Error(`"market" must be at most ${MAX_MARKET_NAME} characters`);
      items.set(n, { ...analysis, market });
    } catch (err) {
      if (!problems.some((p) => p.n === n)) problems.push({ n, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  const bad = new Set(problems.map((p) => p.n));
  const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !items.has(n) && !bad.has(n));
  return { items, problems: problems.filter((p) => !items.has(p.n)), missing };
}

/** A market name without case or punctuation: "None." and "(none)" are both NO_MARKET. */
export const marketKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Groups signals by the market name the model gave them (case and punctuation ignored), largest
 * first. Left out: a signal without a name (not analysed) and one the model marked NO_MARKET
 * (unrelated to the topic), so an off-topic search never becomes a market.
 */
export function groupByMarket<T extends { id: string }>(signals: T[], markets: Map<string, string>): Array<{ name: string; signals: T[] }> {
  const groups = new Map<string, { name: string; signals: T[] }>();
  for (const signal of signals) {
    const name = markets.get(signal.id);
    if (!name) continue;
    const key = marketKey(name);
    if (key === NO_MARKET) continue;
    const group = groups.get(key) ?? { name, signals: [] };
    group.signals.push(signal);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.signals.length - a.signals.length || a.name.localeCompare(b.name));
}
