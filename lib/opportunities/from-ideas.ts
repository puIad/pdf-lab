// lib/opportunities/from-ideas.ts — quick ideas → Deep-run candidates (Phase 3 Part 3.8, DEC-010).
// The seed's top quick ideas join the candidate pool; the PRD §29 selection rules are unchanged.
// Each candidate's evidence is the stored phrase rows behind its idea, so it traces back to a search
// phrase (QC Rule 1) and its demand cites how the phrase was observed (QC Rule 4).

import type { EvidenceInput } from "../evidence/types.ts";
import { jaccard, tokens, type IdeaFormat, type QuickIdea } from "../ideas/ideas.ts";
import { FORMAT_PRICE_TIERS } from "./generator.ts";
import type { GeneratedOpportunity, OpportunityFormat, OpportunityMarketInput, UrgencyLevel } from "./types.ts";

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

const FORMAT_MAP: Record<IdeaFormat, OpportunityFormat> = {
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

function marketFor(idea: QuickIdea, markets: OpportunityMarketInput[]): OpportunityMarketInput {
  const toks = tokens(idea.phrase);
  let best = markets[0];
  let bestScore = -1;
  for (const m of markets) {
    const hay = tokens([m.name, ...m.signals.map((s) => s.analysis?.problem ?? s.title ?? "")].join(" "));
    const score = jaccard(toks, hay) + m.demandScore / 1000; // ties go to the stronger market
    if (score > bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

export function ideaCandidates(
  seed: string,
  ideas: QuickIdea[],
  markets: OpportunityMarketInput[],
  refs: Map<string, IdeaSignalRef>,
): GeneratedOpportunity[] {
  if (markets.length === 0) return [];
  return pickDistinctIdeas(ideas).map((idea) => {
    const id = crypto.randomUUID();
    const market = marketFor(idea, markets);
    const format = FORMAT_MAP[idea.format];
    const { priceRange, sophistication } = FORMAT_PRICE_TIERS[format];
    const urgency: UrgencyLevel = idea.trend ? "high" : idea.isQuestion ? "medium" : "low";
    const evidence: EvidenceInput[] = idea.evidence.map((e) => ({
      entityType: "opportunity",
      entityId: id,
      sourceId: refs.get(e.source_id)?.sourceUuid ?? null,
      claim: `${IDEA_CLAIM_PREFIX} "${idea.phrase}" for seed "${seed}" (${e.source}): ${idea.demandBasis}`,
      excerpt: refs.get(e.source_id)?.excerpt ?? e.title,
      url: e.url,
      signalType: "frequency",
      confidence: idea.confidence,
    }));
    return {
      id,
      marketId: market.id,
      title: idea.title,
      targetAudience: `People searching "${idea.phrase}"`,
      problem: idea.phrase,
      solution: `A ${format.replace("_", " ")} that answers "${idea.phrase}" directly.`,
      format,
      priceRange,
      sophistication,
      mechanism: `${idea.format} built around the searched phrase`,
      outcome: `The reader gets a usable answer to "${idea.phrase}"`,
      urgency,
      opportunityScore: idea.opportunity,
      confidence: idea.confidence,
      evidence,
    } satisfies GeneratedOpportunity;
  });
}
