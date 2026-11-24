// lib/opportunities/from-ideas.ts — quick ideas → Deep-run candidates (Phase 3 Part 3.8, DEC-010).
// The seed's top quick ideas join the candidate pool; the PRD §29 selection rules are unchanged.
// Each candidate's evidence is the stored phrase rows behind its idea, so it traces back to a search
// phrase (QC Rule 1) and its demand cites how the phrase was observed (QC Rule 4).

import type { EvidenceInput } from "../evidence/types.ts";
import { jaccard, tokens, type IdeaFormat, type QuickIdea } from "../ideas/ideas.ts";
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
 * The market that holds the most of the phrase's own words. The seed's words are left out: every
 * market of the run has them. Containment, not jaccard: jaccard divides by all of a market's text,
 * so the market with the fewest signals won every general idea (Part 6.16). A phrase with no word
 * of its own in any market belongs to none: null, never the strongest market as a stand-in
 * (issue #42).
 */
export function marketFor(phrase: string, markets: OpportunityMarketInput[], seed: string): OpportunityMarketInput | null {
  const seedToks = new Set(tokens(seed));
  const toks = [...new Set(tokens(phrase))].filter((t) => !seedToks.has(t));
  let best: OpportunityMarketInput | null = null;
  let bestScore = -1;
  for (const m of markets) {
    const name = new Set(tokens(m.name));
    const hay = new Set([...name, ...tokens(m.signals.map((s) => s.analysis?.problem ?? s.title ?? "").join(" "))]);
    const share = (set: Set<string>) => (toks.length ? toks.filter((t) => set.has(t)).length / toks.length : 0);
    // A word in the market's name counts twice: "is meal prep healthy" belongs to "Healthy meal prep
    // plans", not to a market where one snippet says "healthy". Ties go to the stronger market.
    if (share(hay) === 0) continue; // none of the phrase's own words is in this market
    const score = share(hay) + share(name) + m.demandScore / 1000;
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
    const evidence: EvidenceInput[] = group.flatMap((g) =>
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
    );
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
