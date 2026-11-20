// lib/competition/map.ts — which market of a run a marketplace listing belongs to (Part 6.7).

import { tokens } from "../ideas/ideas.ts";

// shortcut: two shared words is a first guess, checked by hand on 40 stored budgeting listings
// (2026-11-13). Tune it once completed runs have hand-checked assignments.
export const MIN_SHARED_WORDS = 2;

// Words nearly every listing carries: they say "this is a product", not what it is about.
const PRODUCT_WORDS = new Set(
  ("pdf printable print digital download instant editable template planner guide ebook book workbook checklist tracker sheet " +
    "spreadsheet journal notebook bundle kit pack page edition kindle store notion excel google canva free best seller " +
    "complete simple ultimate beginner size letter a4 a5 monthly weekly daily yearly annual").split(" "),
);

const stem = (t: string): string => t.replace(/(ing|s)$/, "");

export interface CompetitorMarket {
  id: string;
  name: string;
  /** Ids of the signals clustered into this market. */
  signalIds: string[];
  /** Problem or title text of those signals. */
  texts: string[];
}

/**
 * A listing clustered into a market belongs to it. Otherwise it goes to the market that shares the
 * most of the title's distinctive words: not the seed's words (every listing of a run matches the
 * seed) and not product words. Fewer than MIN_SHARED_WORDS in common returns null: the listing
 * stays attached to the run only, never to an unrelated market.
 */
export function marketForCompetitor(
  listing: { title: string; signalId?: string | null },
  markets: CompetitorMarket[],
  seed: string,
): string | null {
  if (listing.signalId) {
    const home = markets.find((m) => m.signalIds.includes(listing.signalId!));
    if (home) return home.id;
  }
  const seedStems = tokens(seed).map(stem);
  const distinctive = (text: string): Set<string> =>
    new Set(tokens(text).filter((t) => !PRODUCT_WORDS.has(t) && !seedStems.some((s) => stem(t) === s)));
  const titleWords = distinctive(listing.title);
  let best: string | null = null;
  let bestNamed = 0;
  let bestShared = 0;
  for (const m of markets) {
    // A title holding every distinctive word of a market's name belongs there, and the longest such
    // name wins ("no equipment" over "equipment"). A market made of short search queries has too
    // few words for the shared-word count, so a market with one long snippet used to win (Part 6.16).
    const nameWords = [...distinctive(m.name)];
    const named = nameWords.length > 0 && nameWords.every((t) => titleWords.has(t)) ? nameWords.length : 0;
    const hay = distinctive([m.name, ...m.texts].join(" "));
    const shared = [...titleWords].filter((t) => hay.has(t)).length;
    if (named > bestNamed || (named === bestNamed && shared > bestShared)) {
      best = m.id;
      bestNamed = named;
      bestShared = shared;
    }
  }
  return bestNamed > 0 || bestShared >= MIN_SHARED_WORDS ? best : null;
}

/**
 * Issue #72: what a run does with one listing. A listing is on topic when its title holds every
 * word of the seed, has no words beyond seed and product words, or matches a market (see
 * marketForCompetitor). Anything else ("Noctua Wood PC" for a PC troubleshooting seed) is dropped.
 * A listing holding the whole seed goes to the main market (most signals); one with nothing but
 * seed and product words stays on the run only.
 */
export function placeCompetitor(
  listing: { title: string; signalId?: string | null },
  markets: CompetitorMarket[],
  seed: string,
): { relevant: boolean; marketId: string | null } {
  const direct = marketForCompetitor(listing, markets, seed);
  if (direct) return { relevant: true, marketId: direct };
  const seedStems = tokens(seed).map(stem);
  const all = tokens(listing.title);
  // One seed word says nothing ("budgeting"): only a seed of two or more words, all in the title, counts.
  const holdsSeed = seedStems.length > 0 && seedStems.every((s) => all.some((t) => stem(t) === s));
  const words = all.filter((t) => !PRODUCT_WORDS.has(t) && !seedStems.includes(stem(t)));
  // A one-word seed ("budgeting") keeps the listing on the run only: only a seed of two or more words sends it to the main market.
  if (holdsSeed && seedStems.length >= 2) {
    const main = [...markets].sort((a, b) => b.signalIds.length - a.signalIds.length)[0];
    return { relevant: true, marketId: main?.id ?? null };
  }
  // Holding the seed, or nothing but seed and product words ("Monthly Budget Planner" for `budgeting`): on topic, kept on the run.
  if (holdsSeed || words.length === 0) return { relevant: true, marketId: null };
  return { relevant: false, marketId: null };
}

// Stores whose pages are products. A `web` result from any other host is a discussion, not a competitor.
const STORE_HOSTS = /(^|\.)(etsy\.com|gumroad\.com|payhip\.com|teacherspayteachers\.com|creativemarket\.com|amazon\.[a-z.]{2,6})$/;

export function isStoreUrl(url: string | null | undefined): boolean {
  try {
    return STORE_HOSTS.test(new URL(url ?? "").hostname.toLowerCase());
  } catch {
    return false;
  }
}
