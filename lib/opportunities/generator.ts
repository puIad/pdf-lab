// lib/opportunities/generator.ts — opportunity generator (up to 25) with diversification constraints.
// Part 6.4: every field comes from stored rows or is null; nothing is padded to reach the target.
// Normative specs: PRD §18, §28–§29; docs/05-PIPELINE-SCORING.md; docs/06-EVIDENCE-CONTRACT.md.

import type { AIRouter } from "../ai/router.ts";
import { parsePriceText } from "../competition/check.ts";
import type { EvidenceInput } from "../evidence/types.ts";
import {
  enforceRule1_OpportunityEvidence,
  enforceRule4_DemandCounts,
  enforceRule5_SeparationOfConcerns,
  sourcedEvidenceCount,
} from "../evidence/qc.ts";
import { matchSignals, MIN_TOKEN_MATCH, problemOverlap, type SignalMatch } from "./match.ts";
import { classifyFormat } from "../ideas/ideas.ts";
import { IDEA_FORMAT_MAP } from "./from-ideas.ts";
import {
  ALLOWED_FORMATS,
  OPPORTUNITY_PROMPT_VERSION,
  OPPORTUNITY_TARGET,
  SOPHISTICATION_LEVELS,
  type DiversificationStats,
  type GeneratedOpportunity,
  type OpportunityFormat,
  type OpportunityMarketInput,
  type OpportunitySignalInput,
  type SophisticationLevel,
  type UrgencyLevel,
} from "./types.ts";

export interface GenerateOpportunitiesOptions {
  targetCount?: number; // default OPPORTUNITY_TARGET
  router?: AIRouter;
  tier?: "strong";
  promptVersion?: string;
  /** Extra candidates for the pool, e.g. the seed's quick ideas (Part 3.8). Selection rules are unchanged. */
  extraCandidates?: GeneratedOpportunity[];
}

export interface GenerationResult {
  promptVersion: string;
  /** The run's target. `opportunities.length` below it means the evidence supported fewer. */
  targetCount: number;
  opportunities: GeneratedOpportunity[];
  diversification: DiversificationStats;
  totalCandidatesGenerated: number;
  /** Candidates removed before selection because no evidence row had a source and a url or excerpt. */
  droppedUnsourced: number;
}

function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^\w]/g, "").trim();
}

function jaccardSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

const URGENCY_RANK: Record<UrgencyLevel, number> = { low: 1, medium: 2, high: 3 };

/** Highest urgency that extraction stored on these signals; null when none carries one. */
function observedUrgency(signals: OpportunitySignalInput[]): UrgencyLevel | null {
  let best: UrgencyLevel | null = null;
  for (const s of signals) {
    const u = s.analysis?.urgency?.toLowerCase().trim() as UrgencyLevel | undefined;
    if (u && u in URGENCY_RANK && (!best || URGENCY_RANK[u] > URGENCY_RANK[best])) best = u;
  }
  return best;
}

/**
 * Paid price range of observed listings in their most common currency ("$4.99–$19"), or null.
 * Free listings and unparseable prices are ignored, as in the brief's price anchor.
 */
export function observedPriceRange(prices: Array<string | null | undefined>): string | null {
  const byCurrency = new Map<string, number[]>();
  for (const price of prices) {
    const parsed = parsePriceText(price ?? null);
    if (!parsed || parsed.value <= 0) continue;
    const cur = parsed.currency ?? "";
    byCurrency.set(cur, [...(byCurrency.get(cur) ?? []), parsed.value]);
  }
  if (byCurrency.size === 0) return null;
  const [cur, vals] = [...byCurrency.entries()].sort((x, y) => y[1].length - x[1].length)[0];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return lo === hi ? `${cur}${lo}` : `${cur}${lo}–${cur}${hi}`;
}

/** `pain_point` only when extraction found a problem on the signal; otherwise the source's own type. */
export function evidenceSignalType(sig: { source_type?: string; analysis?: { problem?: string | null } | null }): string {
  return sig.analysis?.problem?.trim() ? "pain_point" : sig.source_type || "general";
}

function signalEvidence(
  oppId: string,
  title: string,
  signals: OpportunitySignalInput[],
  confidence: number,
): EvidenceInput[] {
  return signals.map((sig) => ({
    entityType: "opportunity",
    entityId: oppId,
    sourceId: sig.source_id ?? null,
    claim: `Opportunity "${title}" addresses observed signal: "${sig.title || sig.content?.slice(0, 60)}"`,
    excerpt: sig.content ? sig.content.slice(0, 300) : null,
    url: sig.url,
    signalType: evidenceSignalType(sig),
    confidence,
  }));
}

/** The evidence fields of a candidate: the matched signals, their count, and which rows are its own. */
function matchedEvidence(
  oppId: string,
  title: string,
  own: OpportunitySignalInput[],
  match: SignalMatch,
  confidence: number,
): Pick<GeneratedOpportunity, "evidence" | "matchingSignals" | "marketSignals" | "evidenceSignalIds" | "ownSignalIds"> {
  return {
    evidence: signalEvidence(oppId, title, match.signals, confidence),
    matchingSignals: match.matchCount,
    marketSignals: match.marketTotal,
    evidenceSignalIds: match.signals.map((s) => s.id),
    ownSignalIds: own.map((s) => s.id),
  };
}

/**
 * Two opportunities with different problems must not cite the identical set of signals
 * (Part 6.8). The later one falls back to the signals it was built from; when that set is taken
 * too, it has no evidence of its own and is dropped. Markets of 3 signals or fewer are exempt:
 * there is nothing else to cite.
 */
export function distinctEvidenceSets(
  candidates: GeneratedOpportunity[],
  marketSizes: Map<string, number>,
): GeneratedOpportunity[] {
  const taken = new Map<string, string>(); // market + signal set -> problem that holds it
  const setKey = (c: GeneratedOpportunity, ids: string[]) => `${c.marketId}::${[...ids].sort().join(",")}`;
  const out: GeneratedOpportunity[] = [];
  for (const c of candidates) {
    const ids = c.evidenceSignalIds;
    if (!ids || (marketSizes.get(c.marketId) ?? 0) <= 3) {
      out.push(c);
      continue;
    }
    const problem = normalizeKey(c.problem);
    const holder = taken.get(setKey(c, ids));
    if (holder === undefined || holder === problem) {
      taken.set(setKey(c, ids), problem);
      out.push(c);
      continue;
    }
    const own = new Set(c.ownSignalIds ?? []);
    const ownIds = ids.filter((id) => own.has(id));
    const ownHolder = taken.get(setKey(c, ownIds));
    if (ownIds.length === 0 || (ownHolder !== undefined && ownHolder !== problem)) continue;
    taken.set(setKey(c, ownIds), problem);
    out.push({
      ...c,
      evidence: c.evidence.filter((_, i) => own.has(ids[i])),
      evidenceSignalIds: ownIds,
    });
  }
  return out;
}

/**
 * Candidates built only from stored rows: one per distinct (audience, problem) that extraction
 * found on a market's signals, backed by the market's signals that match that problem
 * (`matchSignals`, at most 5, its own first). A signal without both fields yields
 * nothing, so a thin market gives few candidates and an unanalysed one gives none. Format is a
 * suggestion read from the wording (`classifyFormat`: "guide" when no format word appears).
 * Price is the market's observed competitor range or null.
 */
export function generateCandidatePool(
  markets: OpportunityMarketInput[],
): GeneratedOpportunity[] {
  const candidates: GeneratedOpportunity[] = [];

  for (const market of markets) {
    const groups = new Map<string, { audience: string; problem: string; signals: OpportunitySignalInput[] }>();
    for (const sig of market.signals) {
      const audience = sig.analysis?.audience?.trim();
      const problem = sig.analysis?.problem?.trim();
      if (!audience || !problem) continue;
      const key = `${normalizeKey(audience)}::${normalizeKey(problem)}`;
      const group = groups.get(key) ?? { audience, problem, signals: [] };
      group.signals.push(sig);
      groups.set(key, group);
    }

    for (const { audience, problem, signals } of groups.values()) {
      const wording = [problem, ...signals.map((s) => s.title ?? "")].join(" ");
      const format = IDEA_FORMAT_MAP[classifyFormat(wording)];
      const formatLabel = format.replace("_", " ");
      const title = `${formatLabel.replace(/^\w/, (c) => c.toUpperCase())} for ${audience}: ${problem}`;
      const oppId = crypto.randomUUID();

      candidates.push({
        id: oppId,
        marketId: market.id,
        title,
        targetAudience: audience,
        problem,
        solution: `A ${formatLabel} for ${audience} that addresses: ${problem}`,
        format,
        priceRange: market.priceRange ?? null,
        sophistication: null,
        mechanism: null,
        outcome: null,
        urgency: observedUrgency(signals),
        opportunityScore: Math.max(0, Math.min(100, Math.round(market.demandScore))),
        confidence: market.confidence,
        ...matchedEvidence(oppId, title, signals, matchSignals(problem, signals, market.signals), market.confidence),
      });
    }
  }

  return candidates;
}

/**
 * Selects up to `targetCount` (25) opportunities, fewer when the pool is smaller, satisfying PRD §29 diversification constraints:
 * - Pairwise-distinct on (audience, problem, format).
 * - Maximum format threshold: no single format may exceed 36% (max 9 out of 25).
 * - Maximal Marginal Relevance selection balancing high opportunity score and mutual distinctiveness.
 */
export function selectDiversifiedOpportunities(
  candidates: GeneratedOpportunity[],
  targetCount: number = OPPORTUNITY_TARGET,
): GeneratedOpportunity[] {
  if (candidates.length <= targetCount) {
    return candidates;
  }

  const maxPerFormat = Math.max(3, Math.floor(targetCount * 0.36)); // e.g. 9 for 25
  const selected: GeneratedOpportunity[] = [];
  const selectedKeys = new Set<string>();
  const formatCounts: Record<string, number> = {};

  for (const fmt of ALLOWED_FORMATS) {
    formatCounts[fmt] = 0;
  }

  const remaining = [...candidates];

  while (selected.length < targetCount && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const key = `${normalizeKey(cand.targetAudience)}::${normalizeKey(cand.problem)}::${cand.format}`;

      // Constraint 1: Pairwise distinct on (audience, problem, format)
      if (selectedKeys.has(key)) {
        continue;
      }

      // Constraint 2: Format representation cap
      if (formatCounts[cand.format] >= maxPerFormat) {
        continue;
      }

      // Compute distinctiveness penalty against already selected opportunities
      let maxSimToSelected = 0;
      for (const s of selected) {
        const audMatch = cand.targetAudience === s.targetAudience ? 0.4 : 0;
        const fmtMatch = cand.format === s.format ? 0.35 : 0;
        const probSim = jaccardSimilarity(cand.problem, s.problem) * 0.25;
        const sim = audMatch + fmtMatch + probSim;
        if (sim > maxSimToSelected) {
          maxSimToSelected = sim;
        }
      }

      // MMR formula: 0.65 * normalizedScore - 0.35 * maxSimilarity
      const normalizedScore = cand.opportunityScore / 100;
      const mmr = 0.65 * normalizedScore - 0.35 * maxSimToSelected;

      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const chosen = remaining.splice(bestIdx, 1)[0];
      const chosenKey = `${normalizeKey(chosen.targetAudience)}::${normalizeKey(chosen.problem)}::${chosen.format}`;
      selected.push(chosen);
      selectedKeys.add(chosenKey);
      formatCounts[chosen.format] = (formatCounts[chosen.format] || 0) + 1;
    } else {
      // If constraints exhausted but still need slots, relax format cap gradually
      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const key = `${normalizeKey(cand.targetAudience)}::${normalizeKey(cand.problem)}::${cand.format}`;
        if (!selectedKeys.has(key)) {
          const chosen = remaining.splice(i, 1)[0];
          selected.push(chosen);
          selectedKeys.add(key);
          formatCounts[chosen.format] = (formatCounts[chosen.format] || 0) + 1;
          found = true;
          break;
        }
      }
      if (!found) break; // All remaining are duplicates; exit cleanly
    }
  }

  return selected;
}

export function computeDiversificationStats(opportunities: GeneratedOpportunity[]): DiversificationStats {
  const audiences = new Set<string>();
  const formatCounts: Record<string, number> = {};
  const sophisticationCounts: Record<string, number> = {};
  const urgencyCounts: Record<string, number> = {};
  const priceRanges = new Set<string>();

  for (const fmt of ALLOWED_FORMATS) formatCounts[fmt] = 0;
  for (const soph of ["beginner", "intermediate", "advanced"]) sophisticationCounts[soph] = 0;
  for (const urg of ["low", "medium", "high"]) urgencyCounts[urg] = 0;

  // Null sophistication, urgency or price means "not observed" and is not counted.
  for (const opp of opportunities) {
    audiences.add(opp.targetAudience);
    formatCounts[opp.format] = (formatCounts[opp.format] || 0) + 1;
    if (opp.sophistication) sophisticationCounts[opp.sophistication] += 1;
    if (opp.urgency) urgencyCounts[opp.urgency] += 1;
    if (opp.priceRange) priceRanges.add(opp.priceRange);
  }

  return {
    totalCount: opportunities.length,
    audienceCount: audiences.size,
    formatCounts,
    sophisticationCounts,
    urgencyCounts,
    priceRanges: [...priceRanges],
  };
}

/**
 * Master generator function: takes market clusters, builds a candidate pool, selects up to
 * `targetCount` diversified opportunities (never padded), enforces QC Rules 1, 4, 5.
 */
export async function generate25Opportunities(
  markets: OpportunityMarketInput[],
  options: GenerateOpportunitiesOptions = {},
): Promise<GenerationResult> {
  const targetCount = options.targetCount ?? OPPORTUNITY_TARGET;
  const promptVersion = options.promptVersion ?? OPPORTUNITY_PROMPT_VERSION;

  // Step 1: Generate candidates
  // The observed pool always joins: model candidates add wording, they never replace it.
  // A provider error only loses the model's candidates.
  const fromModel = options.router
    ? await generateWithAIRouter(markets, options.router, options.tier ?? "strong").catch(() => [])
    : [];
  const seenKeys = new Set<string>();
  const deduped = [...fromModel, ...generateCandidatePool(markets)].filter((c) => {
    const key = `${normalizeKey(c.targetAudience)}::${normalizeKey(c.problem)}::${c.format}`;
    return !seenKeys.has(key) && Boolean(seenKeys.add(key));
  });
  deduped.push(...(options.extraCandidates ?? []));

  // A candidate without a sourced evidence row is dropped here, not saved (QC Rule 1, Part 6.8),
  // and no two different problems may cite the identical signal set.
  const sourced = deduped.filter((c) => sourcedEvidenceCount(c.id, c.evidence) > 0);
  const candidatePool = distinctEvidenceSets(sourced, new Map(markets.map((m) => [m.id, m.signals.length])));

  // Step 2: Select a diversified set of at most targetCount
  const finalOpportunities = selectDiversifiedOpportunities(candidatePool, targetCount);

  // Step 3: Enforce QC Rules 1, 4, 5 on every selected opportunity
  for (const opp of finalOpportunities) {
    // QC Rule 1: No opportunity without evidence!
    enforceRule1_OpportunityEvidence(opp, opp.evidence);

    // QC Rule 4: demand cites the count of signals matching this opportunity's problem (> 0)
    enforceRule4_DemandCounts(opp.title, opp.matchingSignals);

    // QC Rule 5: Structural separation
    enforceRule5_SeparationOfConcerns({
      facts: opp.evidence.map((e) => ({
        excerpt: e.excerpt,
        url: e.url,
        source_id: e.sourceId,
      })),
      interpretation: { confidence: opp.confidence },
      suggestion: { solution: opp.solution, format: opp.format },
    });
  }

  const diversification = computeDiversificationStats(finalOpportunities);

  return {
    promptVersion,
    targetCount,
    opportunities: finalOpportunities,
    diversification,
    totalCandidatesGenerated: candidatePool.length,
    droppedUnsourced: deduped.length - sourced.length,
  };
}

/**
 * AI-assisted candidate generation using AIRouter strong tier. The model words the candidates;
 * market, evidence, price and urgency always come from stored rows.
 */
async function generateWithAIRouter(
  markets: OpportunityMarketInput[],
  router: AIRouter,
  tier: "strong",
): Promise<GeneratedOpportunity[]> {
  // The model only sees signals where extraction stored both an audience and a problem.
  const marketSummaries = markets
    .map((m) => ({
      marketId: m.id,
      name: m.name,
      demandScore: m.demandScore,
      confidence: m.confidence,
      topSignals: m.signals
        .filter((s) => s.analysis?.audience?.trim() && s.analysis?.problem?.trim())
        .slice(0, 4)
        .map((s) => ({ id: s.id, title: s.title, problem: s.analysis!.problem, audience: s.analysis!.audience })),
    }))
    .filter((m) => m.topSignals.length > 0)
    .slice(0, 5);
  if (marketSummaries.length === 0) return [];

  const systemPrompt = `You are the lead product strategist at PDF Lab.
Your task is to synthesize diversified, evidence-backed PDF product opportunities based on real market clusters.
Use only audiences and problems that appear in the supplied signals. Never invent an audience, a price or a claim.
Return fewer candidates when the signals support fewer. Each opportunity must be distinct across:
- Target audience (from the signals' "audience" values)
- Problem addressed (from the signals' "problem" values)
- Format: one of checklist, guide, planner, workbook, template, cheat_sheet, tracker, quick_reference
- Sophistication: beginner, intermediate, advanced

Return a JSON array of candidate objects with this exact structure:
[
  {
    "marketId": "the marketId of the market this candidate belongs to, copied exactly",
    "title": "string",
    "targetAudience": "string",
    "problem": "string",
    "solution": "string",
    "format": "checklist|guide|planner|workbook|template|cheat_sheet|tracker|quick_reference",
    "sophistication": "beginner|intermediate|advanced",
    "mechanism": "string",
    "outcome": "string"
  }
]`;

  const userPrompt = `Synthesize up to 50 distinct PDF product candidates for these observed markets:
${JSON.stringify(marketSummaries, null, 2)}`;

  interface AICandidate {
    marketId: string;
    title: string;
    targetAudience: string;
    problem: string;
    solution: string;
    format: string;
    sophistication?: unknown;
    mechanism?: unknown;
    outcome?: unknown;
  }

  const filled = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

  const res = await router.generateObject<AICandidate[]>({
    tier,
    system: systemPrompt,
    user: userPrompt,
    validate: (raw: unknown): AICandidate[] => {
      if (!Array.isArray(raw)) throw new Error("AI output must be an array");
      // A candidate missing a required field is skipped, never completed with a default.
      return raw.filter((item): item is AICandidate => (
        Boolean(item) &&
        filled(item.marketId) &&
        filled(item.title) &&
        filled(item.targetAudience) &&
        filled(item.problem) &&
        filled(item.solution) &&
        filled(item.format)
      ));
    },
  });

  const out: GeneratedOpportunity[] = [];
  const marketMap = new Map(markets.map((m) => [m.id, m]));

  for (const raw of res.object) {
    const market = marketMap.get(raw.marketId);
    if (!market) continue;

    // The audience must be one extraction stored on this market's signals. A model-invented
    // audience has no such signals and is skipped.
    const audienceKey = normalizeKey(raw.targetAudience);
    const audienceSignals = market.signals.filter(
      (s) => s.analysis?.audience && normalizeKey(s.analysis.audience) === audienceKey,
    );
    if (audienceSignals.length === 0) continue;
    // Its evidence is the signals that speak about the model's problem wording (Part 6.8).
    // No stored embedding exists for new wording, so its own signals are found by shared words;
    // a problem none of that audience's signals mentions has no evidence and is skipped.
    const signals = audienceSignals.filter((s) => problemOverlap(raw.problem, s) >= MIN_TOKEN_MATCH);
    if (signals.length === 0) continue;

    const format = raw.format.toLowerCase().trim() as OpportunityFormat;
    if (!ALLOWED_FORMATS.includes(format)) continue;

    const soph = filled(raw.sophistication) ? raw.sophistication.toLowerCase().trim() : "";
    const oppId = crypto.randomUUID();
    const title = raw.title.trim();

    out.push({
      id: oppId,
      marketId: market.id,
      title,
      targetAudience: audienceSignals[0].analysis!.audience!.trim(), // stored wording
      problem: raw.problem.trim(),
      solution: raw.solution.trim(),
      format,
      priceRange: market.priceRange ?? null,
      sophistication: (SOPHISTICATION_LEVELS as readonly string[]).includes(soph) ? (soph as SophisticationLevel) : null,
      mechanism: filled(raw.mechanism) ? raw.mechanism.trim() : null,
      outcome: filled(raw.outcome) ? raw.outcome.trim() : null,
      urgency: observedUrgency(signals),
      opportunityScore: market.demandScore,
      confidence: market.confidence,
      ...matchedEvidence(oppId, title, signals, matchSignals(raw.problem, signals, market.signals), market.confidence),
    });
  }

  return out;
}
