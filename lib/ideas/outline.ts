// lib/ideas/outline.ts — deterministic section outline for a quick idea (Phase 3 Part 3.6).
// Ranks the seed's other phrases by opportunity, a question bonus and word overlap with the
// target, drops near-duplicates, and turns phrases into headings. No LLM. Section defaults
// below are PDF Lab's own text.

import { isQuestion, jaccard, tokens } from "./ideas.ts";
import type { IdeaFormat } from "./ideas.ts";

const SECTIONS: Record<IdeaFormat, { n: number; defaults: string[] }> = {
  Guide: { n: 6, defaults: ["Why {T} matters", "What you need before you start", "The core method, step by step", "Mistakes that slow people down", "Quick wins and shortcuts", "Where to go from here"] },
  Checklist: { n: 4, defaults: ["Prepare", "Set up", "Do it", "Check and finish"] },
  Planner: { n: 4, defaults: ["Your goal and starting point", "Weekly plan", "Daily tracker", "Review and adjust"] },
  Worksheet: { n: 5, defaults: ["Where you are now with {T}", "What you want to change", "What stands in the way", "Your first three actions", "Check-in after 30 days"] },
  "Cheat sheet": { n: 4, defaults: ["Key terms", "Core rules", "Common pitfalls", "Quick reference"] },
  Ebook: { n: 5, defaults: ["Foundations of {T}", "Getting it working", "Going deeper", "Real-world examples", "Troubleshooting"] },
  Report: { n: 4, defaults: ["Demand overview", "What people search for", "Gaps worth filling", "Recommendations"] },
};

const QUESTION_BONUS = 12;
const OVERLAP_WEIGHT = 45;
const DUPLICATE_AT = 0.6;

export function headingFrom(phrase: string): string {
  const p = phrase.trim().replace(/\s+/g, " ").replace(/\?+$/, "");
  if (!p) return "";
  if (isQuestion(p) && !/^how to\b/i.test(p)) return `${p.charAt(0).toUpperCase()}${p.slice(1)}?`;
  return p.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export interface OutlineInput {
  phrase: string;
  format: IdeaFormat;
  related: Array<{ phrase: string; opportunity: number }>;
  offset?: number; // rotate the ranking for "suggest different sections"
}

export function suggestOutline({ phrase, format, related, offset = 0 }: OutlineInput): string[] {
  const { n, defaults } = SECTIONS[format];
  const main = tokens(phrase);
  const ranked = related
    .filter((r) => r.phrase && r.phrase.toLowerCase() !== phrase.toLowerCase())
    .map((r) => ({
      phrase: r.phrase,
      score: r.opportunity + (isQuestion(r.phrase) ? QUESTION_BONUS : 0) + OVERLAP_WEIGHT * jaccard(tokens(r.phrase), main),
    }))
    .sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase));
  const k = ranked.length ? offset % ranked.length : 0;
  const rotated = [...ranked.slice(k), ...ranked.slice(0, k)];

  // Dedupe on the words the target doesn't already have: every phrase shares the seed's words,
  // which would make all of them look like near-duplicates of each other.
  const mainSet = new Set(main);
  const picked: string[][] = [];
  const out: string[] = [];
  for (const r of rotated) {
    if (out.length >= n) break;
    const t = tokens(r.phrase).filter((w) => !mainSet.has(w));
    if (picked.some((p) => jaccard(p, t) >= DUPLICATE_AT)) continue;
    picked.push(t);
    out.push(headingFrom(r.phrase));
  }
  for (const d of defaults) {
    if (out.length >= n) break;
    out.push(d.replace(/\{T\}/g, phrase));
  }
  return out;
}
