// lib/brief/blocks.ts — one ordered block list for a brief; Markdown and DOCX both render it, so the
// two exports carry the same lines and the DOCX round-trip test can compare text block by block.

import { ETSY_TAGS_MAX, ETSY_TITLE_MAX } from "./etsy.ts";
import { briefCites } from "./build.ts";
import { DESCRIPTION_KEY, type Brief, type BriefAiNote, type BriefCite, type BriefFact } from "./types.ts";

export type BlockKind = "h1" | "h2" | "h3" | "p" | "bullet" | "quote" | "note";

export interface BlockLink {
  label: string;
  url: string | null;
}

export interface Block {
  kind: BlockKind;
  text: string;
  links: BlockLink[];
}

const MAX_LINKS = 6;

function links(cites: BriefCite[]): BlockLink[] {
  const out: BlockLink[] = cites.slice(0, MAX_LINKS).map((c, i) => ({ label: `${c.source} ${i + 1}`, url: c.url }));
  if (cites.length > MAX_LINKS) out.push({ label: `+${cites.length - MAX_LINKS} more`, url: null });
  return out;
}

/** The text a block reads as, sources included: what both exports must contain. */
export function plainText(b: Block): string {
  return b.links.length ? `${b.text} (Sources: ${b.links.map((l) => l.label).join(", ")})` : b.text;
}

export function sourceLine(brief: Brief): string {
  const s = brief.source;
  return s.kind === "opportunity"
    ? `Source: Deep-run opportunity ${s.id}`
    : `Source: quick idea "${s.phrase}" from the seed "${s.seed}"`;
}

export function briefBlocks(brief: Brief): Block[] {
  const all = briefCites(brief);
  const out: Block[] = [];
  const add = (kind: BlockKind, text: string, l: BlockLink[] = []) => out.push({ kind, text, links: l });
  const fact = (kind: BlockKind, f: BriefFact) => add(kind, f.text, links(f.cites));
  const note = (n: BriefAiNote) =>
    add("note", `AI interpretation (${n.model}): ${n.text}`, links(n.citeIds.map((id) => all.get(id)).filter((c): c is BriefCite => !!c)));

  add("h1", brief.title);
  add("p", `Format: ${brief.format}. ${sourceLine(brief)}. Generated ${brief.generatedAt.slice(0, 10)}.`);
  add(
    "p",
    "How to read this brief: fact lines cite stored evidence; suggestion lines follow fixed rules from cited facts; AI interpretation lines were written by a language model from the cited evidence and need checking.",
  );

  if (brief.verdict) {
    add("h2", "Validate verdict");
    add("p", `${brief.verdict.verdict}: ${brief.verdict.reason}`);
    for (const c of brief.verdict.checks) add("bullet", `${c.label}: ${c.status.replace("_", " ")}, ${c.count} (rule: ${c.threshold})`);
  }
  if (brief.adviceNote) {
    add("h2", "Not professional advice");
    add("p", brief.adviceNote);
  }

  add("h2", "Promise");
  fact("p", brief.promise);
  add("h2", "Audience");
  if (brief.audience) fact("p", brief.audience);
  else add("p", "Not observed in stored signals.");

  add("h2", "Outline");
  for (const s of brief.outline) {
    add("h3", s.heading);
    add("p", s.fromPhrase ? `Suggestion: heading from the search "${s.fromPhrase}".` : "Suggestion: standard heading for this format.");
    const n = brief.notes[s.heading];
    if (n) note(n);
  }

  add("h2", "Buyer language (verbatim)");
  if (brief.buyerLanguage.length) for (const q of brief.buyerLanguage) fact("quote", q);
  else add("p", "None observed.");

  add("h2", "Keywords");
  for (const k of brief.keywords) fact("bullet", k);

  add("h2", "Where to sell");
  if (brief.whereToSell) fact("p", brief.whereToSell.fact);
  else add("p", brief.source.kind === "idea" ? "Not observed: run a competition check on the idea first." : "No competitors stored for this market.");

  add("h2", "Price anchor");
  if (brief.priceAnchor) fact("p", brief.priceAnchor);
  else add("p", "No priced listing observed.");

  add("h2", "Listing copy");
  add("h3", "Etsy title");
  add("p", brief.listing.etsyTitle);
  add("p", `Suggestion from the keywords above: ${brief.listing.etsyTitle.length} of ${ETSY_TITLE_MAX} characters.`);
  add("h3", `Etsy tags (${brief.listing.etsyTags.length} of ${ETSY_TAGS_MAX})`);
  for (const t of brief.listing.etsyTags) add("bullet", t);
  add("h3", "Description (Gumroad / Etsy)");
  const d = brief.notes[DESCRIPTION_KEY];
  if (d) note(d);
  else add("p", "Not drafted yet.");

  add("h2", "Bonus angles");
  if (brief.bonusAngles.length) for (const b of brief.bonusAngles) fact("bullet", b);
  else add("p", "None observed.");

  add("p", "Built by PDF Lab under its evidence contract: no revenue estimates, no claims without stored evidence.");
  return out;
}
