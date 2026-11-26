// lib/opportunities/from-ideas.ts — quick ideas → Deep-run candidates (Phase 3 Part 3.8, DEC-010).
// The seed's top quick ideas join the candidate pool; the PRD §29 selection rules are unchanged.
// Each candidate's evidence is the stored phrase rows behind its idea, so it traces back to a search
// phrase (QC Rule 1) and its demand cites how the phrase was observed (QC Rule 4).

import { distinctEvidence, type EvidenceInput } from "../evidence/types.ts";
import { jaccard, tokens, type IdeaFormat, type QuickIdea } from "../ideas/ideas.ts";
import { namesNoProblem } from "./match.ts";
import type { GeneratedOpportunity, OpportunityFormat, OpportunityMarketInput } from "./types.ts";

export const IDEA_CANDIDATES = 20;
/** Two phrases sharing this much of their content words count as one idea. */
export const NEAR_DUPLICATE = 0.6;
/** Marker in the evidence claim; SQL traces a Deep-run opportunity back to its phrase with it. */
export const IDEA_CLAIM_PREFIX = "Quick-idea phrase";

/** Evidence row of a quick idea plus the `sources.id` of the signal it came from. */
export interface IdeaSignalRef {
  sourceUuid: string | null;
  excerpt: string | null;
}

export const IDEA_FORMAT_MAP: Record<IdeaFormat, OpportunityFormat> = {
  Guide: "guide",
  Checklist: "checklist",
  Planner: "planner",
  Worksheet: "workbook",
  "Cheat sheet": "cheat_sheet",
  Ebook: "guide",
  Report: "quick_reference",
};

/** Top ideas by opportunity, dropping any whose content words overlap a kept one by ≥ NEAR_DUPLICATE. */
export function pickDistinctIdeas(ideas: QuickIdea[], max = IDEA_CANDIDATES): QuickIdea[] {
  const kept: Array<{ idea: QuickIdea; toks: string[] }> = [];
  for (const idea of [...ideas].sort((a, b) => b.opportunity - a.opportunity)) {
    if (kept.length >= max) break;
    if (idea.evidence.length === 0) continue; // QC Rule 1
    const toks = tokens(idea.phrase);
    if (kept.some((k) => jaccard(k.toks, toks) >= NEAR_DUPLICATE)) continue;
    kept.push({ idea, toks });
  }
  return kept.map((k) => k.idea);
}

/**
 * Among the markets that hold all of the phrase's own words, the one whose name holds the most of
 * them. The seed's words are left out: every
 * market of the run has them. Containment, not jaccard: jaccard divides by all of a market's text,
 * so the market with the fewest signals won every general idea (Part 6.16). A phrase belongs to a
 * market only when it is about that market's problem: every word of its own is in the market, and
 * either the phrase names at least half of the words of the market's name, or all its own words
 * are in a problem one of the market's signals names (a signal that names none says nothing about
 * the market's problem). One shared word is not enough
 * ("help" put "find someone to help me with my computer" in a blue-screen market; "reset" put
 * "how to reset a pc" in "CMOS reset and onboard video", issue #120). A phrase that fits no market
 * belongs to none: null, never the strongest market as a stand-in (issue #42).
 * shortcut: the half-of-the-name bar was set from one run (2026-11-26), tune it against more
 * hand-checked runs.
 */
export function marketFor(phrase: string, markets: OpportunityMarketInput[], seed: string): OpportunityMarketInput | null {
  const seedToks = new Set(tokens(seed));
  const all = new Set(tokens(phrase));
  const toks = [...all].filter((t) => !seedToks.has(t));
  let best: OpportunityMarketInput | null = null;
  let bestScore = -1;
  for (const m of markets) {
    const nameWords = tokens(m.name);
    const name = new Set(nameWords);
    const hay = new Set([...name, ...tokens(m.signals.map((s) => s.analysis?.problem ?? s.title ?? "").join(" "))]);
    const named = new Set(tokens(m.signals.filter((s) => !namesNoProblem(s.analysis)).map((s) => s.analysis?.problem ?? s.title ?? "").join(" ")));
    const share = (set: Set<string>) => (toks.length ? toks.filter((t) => set.has(t)).length / toks.length : 0);
    if (share(hay) < 1) continue; // a word of the phrase's own is not in this market (empty phrase: share 0)
    // Neither the name nor a named problem is about the phrase: the market is about something else.
    if (nameWords.filter((t) => all.has(t)).length * 2 < nameWords.length && share(named) < 1) continue;
    // The name decides: "is meal prep healthy" belongs to "Healthy meal prep plans", not to a market
    // where one snippet says "healthy". Ties go to the stronger market.
    const score = share(name) + m.demandScore / 1000;
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The picked ideas grouped by the market their words are found in, strongest idea first. An idea
 * that fits no market of the run is counted in `unplaced`: `opportunities.market_id` is required,
 * and filing it under an unrelated market would claim a link nobody observed (issue #42). It stays
 * a quick idea on the seed's scan.
 */
function placeIdeas(seed: string, ideas: QuickIdea[], markets: OpportunityMarketInput[]) {
  const byMarket = new Map<string, { market: OpportunityMarketInput; ideas: QuickIdea[] }>();
  let unplaced = 0;
  for (const idea of markets.length === 0 ? [] : pickDistinctIdeas(ideas)) {
    const market = marketFor(idea.phrase, markets, seed);
    if (!market) {
      unplaced++;
      continue;
    }
    const group = byMarket.get(market.id) ?? { market, ideas: [] };
    group.ideas.push(idea);
    byMarket.set(market.id, group);
  }
  return { groups: [...byMarket.values()], unplaced };
}

/** How many picked quick ideas fit no market of the run and are left out of it. */
export function ideasInNoMarket(seed: string, ideas: QuickIdea[], markets: OpportunityMarketInput[]): number {
  return placeIdeas(seed, ideas, markets).unplaced;
}

/**
 * Quick ideas as candidates of a Deep run: one per market. Phrases found in one market share its
 * need, so they are one opportunity that cites every phrase (issue #85); the market holds the
 * need, a search phrase alone cannot tell two needs apart.
 * shortcut: one phrase-only opportunity per market, even when its phrases ask for two things;
 * split by phrase overlap if a market's phrases turn out to hold separate needs.
 */
export function ideaCandidates(
  seed: string,
  ideas: QuickIdea[],
  markets: OpportunityMarketInput[],
  refs: Map<string, IdeaSignalRef>,
): GeneratedOpportunity[] {
  return placeIdeas(seed, ideas, markets).groups.map(({ market, ideas: group }) => {
    const idea = group[0];
    const id = crypto.randomUUID();
    const format = IDEA_FORMAT_MAP[idea.format];
    // Once per distinct (claim, url): phrase rows repeat, and the count below is the demand count.
    const evidence: EvidenceInput[] = distinctEvidence(group.flatMap((g) =>
      g.evidence.map((e) => ({
        entityType: "opportunity" as const,
        entityId: id,
        sourceId: refs.get(e.source_id)?.sourceUuid ?? null,
        claim: `${IDEA_CLAIM_PREFIX} "${g.phrase}" for seed "${seed}" (${e.source}): ${g.demandBasis}`,
        excerpt: refs.get(e.source_id)?.excerpt ?? e.title,
        url: e.url,
        signalType: "frequency" as const,
        confidence: g.confidence,
      })),
    ), (e) => [e.entityId, e.claim, e.url]);
    return {
      id,
      marketId: market.id,
      title: idea.title,
      targetAudience: `People searching "${idea.phrase}"`,
      problem: idea.phrase,
      solution: `A ${format.replace("_", " ")} that answers "${idea.phrase}" directly.`,
      format,
      formatBasis: null,
      priceRange: market.priceRange ?? null,
      sophistication: null,
      mechanism: null,
      outcome: null,
      urgency: null, // phrase rows are never extracted, so no urgency is observed
      opportunityScore: idea.opportunity,
      confidence: idea.confidence,
      evidence,
      matchingSignals: evidence.length, // phrase rows observed for this need, not market discussions
      marketSignals: null,
    } satisfies GeneratedOpportunity;
  });
}

/** True when every evidence claim of an opportunity is a quick-idea phrase row: it rests on search suggestions alone. */
export function isIdeaOnly(claims: string[]): boolean {
  // A stored claim carries a "[type: ... | conf: ...]" prefix (parseEvidenceClaim).
  return claims.length > 0 && claims.every((c) => c.replace(/^\[[^\]]*\]\s*/, "").startsWith(IDEA_CLAIM_PREFIX));
}

/** Report wording for an idea-only opportunity (issue #70). */
export function ideaOnlyNote(): string {
  return "Rests on search phrases alone and has no problem, buyer-intent or gap evidence beyond a search suggestion.";
}
