// lib/brief/notes.ts — on-demand AI notes for a brief (Part 3.10 tasks 2 and 3, DEC-010 item 12).
// One click = one cheap-tier call through AIRouter. The model sees only this brief's cited lines,
// numbered E1..En, and must name the ones it used; a note citing nothing, or an unknown number, is
// rejected. Notes are shown as AI interpretation (QC Rule 5), never as facts.

import type { AIRouter } from "../ai/router.ts";
import { briefCites } from "./build.ts";
import { DESCRIPTION_KEY, type Brief, type BriefAiNote, type BriefFact } from "./types.ts";

export const BRIEF_NOTES_PROMPT_VERSION = "brief-notes-2026-11-06.1";
const MAX_ITEMS = 24;
const MAX_NOTE = 1200;

interface Item {
  label: string;
  text: string;
  citeId: string;
}

/** The numbered evidence the model may use: buyer language first, then the other cited lines. */
export function noteEvidence(brief: Brief): Item[] {
  const facts: Array<[string, BriefFact | null]> = [
    ...brief.buyerLanguage.map((f) => ["buyer language", f] as [string, BriefFact]),
    ["promise", brief.promise],
    ["audience", brief.audience],
    ...brief.keywords.map((f) => ["search phrase", f] as [string, BriefFact]),
    ...brief.bonusAngles.map((f) => ["gap or add-on", f] as [string, BriefFact]),
    ["marketplaces", brief.whereToSell?.fact ?? null],
    ["prices", brief.priceAnchor],
  ];
  const items: Item[] = [];
  for (const [kind, f] of facts) {
    if (!f || !f.cites.length || items.length >= MAX_ITEMS) continue;
    items.push({ label: `E${items.length + 1}`, text: `${kind}: ${f.text.slice(0, 300)}`, citeId: f.cites[0].id });
  }
  return items;
}

export function noteValidator(items: Item[]) {
  const byLabel = new Map(items.map((i) => [i.label, i]));
  return (raw: unknown): { text: string; citeIds: string[] } => {
    const o = raw as { note?: unknown; evidence?: unknown } | null;
    const text = typeof o?.note === "string" ? o.note.trim() : "";
    if (!text) throw new Error("note is empty");
    if (text.length > MAX_NOTE) throw new Error(`note is longer than ${MAX_NOTE} characters`);
    const labels = Array.isArray(o?.evidence) ? o.evidence.map(String) : [];
    if (!labels.length) throw new Error("note cites no evidence");
    const unknown = labels.filter((l) => !byLabel.has(l));
    if (unknown.length) throw new Error(`note cites unknown evidence ${unknown.join(", ")}`);
    return { text, citeIds: [...new Set(labels.map((l) => byLabel.get(l)!.citeId))] };
  };
}

const SYSTEM = [
  "You help a creator plan a printable PDF product from market research.",
  "Use ONLY the numbered evidence lines. Do not add statistics, prices, sales figures or claims that are not in them.",
  'Reply as JSON: {"note": "<plain text>", "evidence": ["E1", "E3"]} where evidence lists every line you relied on (at least one).',
].join(" ");

/** Write one note: `key` is an outline heading, or DESCRIPTION_KEY for the listing description. */
export async function writeBriefNote(router: AIRouter, brief: Brief, key: string): Promise<BriefAiNote> {
  const isDescription = key === DESCRIPTION_KEY;
  if (!isDescription && !brief.outline.some((s) => s.heading === key)) throw new Error(`no outline section "${key}"`);
  const items = noteEvidence(brief);
  if (!items.length) throw new Error("this brief has no cited lines to write from");

  const task = isDescription
    ? `Draft a product description (90 to 150 words) for a Gumroad or Etsy listing of "${brief.title}", a ${brief.format.toLowerCase()}. Echo the buyer language where it fits. No price, no guarantees, no medical, financial or legal promises.`
    : `Write a short note (2 to 4 sentences) on what the section "${key}" of "${brief.title}" (a ${brief.format.toLowerCase()}) should cover, based on what buyers said and searched.`;
  const user = [
    task,
    brief.adviceNote ? `Note: ${brief.adviceNote}` : "",
    "",
    "Evidence:",
    ...items.map((i) => `${i.label}. ${i.text}`),
  ].join("\n");

  const res = await router.generateObject({ tier: "cheap", system: SYSTEM, user, validate: noteValidator(items), temperature: 0.4, maxTokens: 1500 });
  const known = briefCites(brief);
  return {
    text: res.object.text,
    citeIds: res.object.citeIds.filter((id) => known.has(id)),
    provider: res.provider,
    model: res.model,
  };
}
