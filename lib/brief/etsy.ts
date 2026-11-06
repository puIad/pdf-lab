// lib/brief/etsy.ts — Etsy title and tags from observed keywords (Part 3.10 task 3).
// Limits re-verified 2026-11-06:
//   - character rules: Etsy Open API v3 spec (createDraftListing `title`, `tags`),
//     https://www.etsy.com/openapi/generated/oas/3.0.0.json
//   - lengths: Etsy Help, "How to Use Tags to Get Found in Search" (13 tags, 20 characters each) and
//     "How to Create a Listing" (title up to 140 characters).

export const ETSY_TITLE_MAX = 140;
export const ETSY_TAG_MAX = 20;
export const ETSY_TAGS_MAX = 13;

/** Characters a title may not contain (Etsy's regex). */
const TITLE_BAD = /[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/gu;
/** Characters a tag may not contain (Etsy's regex). */
const TAG_BAD = /[^\p{L}\p{Nd}\p{Zs}\-'™©®]/gu;
/** "You can only use the %, :, & and + characters once each." */
const ONCE = ["%", ":", "&", "+"];

export function cleanTitlePart(s: string): string {
  return s.replace(TITLE_BAD, " ").replace(/\s+/g, " ").trim();
}

function keepFirstOnly(s: string): string {
  let out = s;
  for (const c of ONCE) {
    const i = out.indexOf(c);
    if (i < 0) continue;
    out = out.slice(0, i + 1) + out.slice(i + 1).split(c).join(" ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Title-cased lead keyword, then further keywords joined by ", " while the title fits 140 chars. */
export function etsyTitle(keywords: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const p = cleanTitlePart(k);
    const key = p.toLowerCase();
    if (!p || seen.has(key)) continue;
    const next = keepFirstOnly([...parts, p].join(", "));
    if (next.length > ETSY_TITLE_MAX) {
      if (parts.length === 0) parts.push(p.slice(0, ETSY_TITLE_MAX).replace(/\s+\S*$/, "").trim() || p.slice(0, ETSY_TITLE_MAX));
      continue;
    }
    parts.push(p);
    seen.add(key);
  }
  const title = keepFirstOnly(parts.join(", "));
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function cleanTag(s: string): string {
  return s.toLowerCase().replace(TAG_BAD, " ").replace(/\s+/g, " ").trim();
}

/**
 * Up to 13 unique tags of at most 20 characters. Keywords that fit are used as they are; longer
 * ones contribute their two-word runs, so a tag is always words a buyer actually typed.
 */
export function etsyTags(keywords: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    if (out.length >= ETSY_TAGS_MAX || !t || t.length > ETSY_TAG_MAX || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  const cleaned = keywords.map(cleanTag).filter(Boolean);
  for (const k of cleaned) add(k);
  for (const k of cleaned) {
    if (k.length <= ETSY_TAG_MAX) continue;
    const w = k.split(" ").filter((x) => !/^(how|to|what|is|are|the|a|an|for|of|and|in|on|do|does|can|why|it|its|my|your|with|vs)$/.test(x));
    for (let i = 0; i + 1 < w.length; i++) add(`${w[i]} ${w[i + 1]}`);
  }
  return out;
}

/** Problems with a title or tag list against Etsy's rules; empty when valid. */
export function etsyProblems(title: string, tags: string[]): string[] {
  const p: string[] = [];
  if (!title) p.push("title is empty");
  if (title.length > ETSY_TITLE_MAX) p.push(`title is ${title.length} characters`);
  if (new RegExp(TITLE_BAD.source, "u").test(title)) p.push("title has a character Etsy rejects");
  for (const c of ONCE) if (title.split(c).length > 2) p.push(`title uses "${c}" more than once`);
  if (tags.length > ETSY_TAGS_MAX) p.push(`${tags.length} tags`);
  if (new Set(tags.map((t) => t.toLowerCase())).size !== tags.length) p.push("duplicate tags");
  for (const t of tags) {
    if (t.length > ETSY_TAG_MAX) p.push(`tag "${t}" is ${t.length} characters`);
    if (new RegExp(TAG_BAD.source, "u").test(t)) p.push(`tag "${t}" has a character Etsy rejects`);
  }
  return p;
}
