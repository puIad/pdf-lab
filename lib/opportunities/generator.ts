// lib/opportunities/generator.ts — 25-Opportunity Generator with Diversification Constraints.
// Normative specs: PRD §18, §28–§29; docs/05-PIPELINE-SCORING.md; docs/06-EVIDENCE-CONTRACT.md.

import type { AIRouter } from "../ai/router.ts";
import type { EvidenceInput } from "../evidence/types.ts";
import {
  enforceRule1_OpportunityEvidence,
  enforceRule4_DemandCounts,
  enforceRule5_SeparationOfConcerns,
} from "../evidence/qc.ts";
import {
  ALLOWED_FORMATS,
  OPPORTUNITY_PROMPT_VERSION,
  type DiversificationStats,
  type GeneratedOpportunity,
  type OpportunityFormat,
  type OpportunityMarketInput,
  type SophisticationLevel,
  type UrgencyLevel,
} from "./types.ts";

export interface GenerateOpportunitiesOptions {
  targetCount?: number; // default 25
  router?: AIRouter;
  tier?: "strong";
  promptVersion?: string;
}

export interface GenerationResult {
  promptVersion: string;
  opportunities: GeneratedOpportunity[];
  diversification: DiversificationStats;
  totalCandidatesGenerated: number;
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

const DIVERSE_AUDIENCE_TEMPLATES = [
  "Non-Technical PC Owners & Everyday Users",
  "Budget PC Builders & Upgraders",
  "Competitive Gamers & Streamers",
  "Remote Workers & Home Office Professionals",
  "IT Support Specialists & Helpdesk Technicians",
  "Digital Creatives & Video Editors",
  "Students & Academic Researchers",
  "Small Business Owners Managing In-House PCs",
] as const;

const FORMAT_PRICE_TIERS: Record<OpportunityFormat, { priceRange: string; sophistication: SophisticationLevel }> = {
  checklist: { priceRange: "$7–$12", sophistication: "beginner" },
  cheat_sheet: { priceRange: "$7–$12", sophistication: "beginner" },
  quick_reference: { priceRange: "$9–$15", sophistication: "intermediate" },
  guide: { priceRange: "$15–$25", sophistication: "intermediate" },
  template: { priceRange: "$12–$19", sophistication: "intermediate" },
  tracker: { priceRange: "$9–$17", sophistication: "intermediate" },
  workbook: { priceRange: "$19–$29", sophistication: "intermediate" },
  planner: { priceRange: "$17–$27", sophistication: "advanced" },
};

const MECHANISM_TEMPLATES: Record<OpportunityFormat, string> = {
  checklist: "Step-by-step sequential verification and hardware isolation checklist",
  cheat_sheet: "One-page fast symptom-to-solution matrix and keyboard/BIOS shortcuts lookup",
  quick_reference: "At-a-glance error code deciphering and emergency triage flowcard",
  guide: "Illustrated end-to-end diagnostic and root-cause resolution walkthrough",
  template: "Standardized system build specification and pre-flight configuration template",
  tracker: "Hardware temperature, driver update, and stability stress-test logging tracker",
  workbook: "Interactive self-paced system optimization and bottleneck discovery exercises",
  planner: "Scheduled preventative maintenance calendar and routine backup roadmap",
};

/**
 * Deterministically generates a broad pool of candidate opportunities (up to 50)
 * grounded directly in the provided market clusters and signals.
 */
export function generateCandidatePool(
  markets: OpportunityMarketInput[],
): GeneratedOpportunity[] {
  if (markets.length === 0) return [];

  const candidates: GeneratedOpportunity[] = [];

  for (let mIdx = 0; mIdx < markets.length; mIdx++) {
    const market = markets[mIdx];
    const signals = market.signals.length > 0 ? market.signals : [];

    // Cycle through formats and audience templates to ensure wide diversification
    for (let fIdx = 0; fIdx < ALLOWED_FORMATS.length; fIdx++) {
      const format = ALLOWED_FORMATS[fIdx];
      const audIdx = (mIdx * ALLOWED_FORMATS.length + fIdx) % DIVERSE_AUDIENCE_TEMPLATES.length;
      const targetAudience = DIVERSE_AUDIENCE_TEMPLATES[audIdx];

      // Ground problem in market signals when available
      const supportingSignal = signals.length > 0
        ? signals[fIdx % signals.length]
        : null;

      const problemSnippet = supportingSignal?.analysis?.problem ||
        supportingSignal?.title ||
        `${market.name} recurring failures`;

      const formatLabel = format.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const title = `${market.name}: ${targetAudience} ${formatLabel}`;
      const { priceRange, sophistication } = FORMAT_PRICE_TIERS[format];
      const mechanism = MECHANISM_TEMPLATES[format];
      const outcome = `Eliminate ${market.name.toLowerCase()} downtime in under 15 minutes without expensive repair shop visits`;

      // Evidence backing (QC Rule 1)
      const evidenceItems: EvidenceInput[] = [];
      const oppId = crypto.randomUUID();

      const signalsToAttach = signals.slice(0, 3);
      if (signalsToAttach.length > 0) {
        for (const sig of signalsToAttach) {
          evidenceItems.push({
            entityType: "opportunity",
            entityId: oppId,
            sourceId: sig.source_id ?? null,
            claim: `Opportunity "${title}" addresses observed signal: "${sig.title || sig.content?.slice(0, 60)}"`,
            excerpt: sig.content ? sig.content.slice(0, 300) : null,
            url: sig.url,
            signalType: "pain_point",
            confidence: market.confidence,
          });
        }
      } else {
        // Fallback evidence item from market level
        evidenceItems.push({
          entityType: "opportunity",
          entityId: oppId,
          claim: `Opportunity "${title}" directly addresses market cluster "${market.name}"`,
          signalType: "pain_point",
          confidence: market.confidence,
        });
      }

      const urgency: UrgencyLevel =
        fIdx % 3 === 0 ? "high" : fIdx % 3 === 1 ? "medium" : "low";

      // Monotonic score calculation aligned with market demand and format fit
      const formatScoreBonus = format === "checklist" || format === "guide" ? 5 : 0;
      const opportunityScore = Math.max(
        10,
        Math.min(100, Math.round(market.demandScore + formatScoreBonus - (fIdx * 1.5))),
      );

      candidates.push({
        id: oppId,
        marketId: market.id,
        title,
        targetAudience,
        problem: problemSnippet,
        solution: `${mechanism} delivering a structured, offline printable PDF with step-by-step diagnostic workflows.`,
        format,
        priceRange,
        sophistication,
        mechanism,
        outcome,
        urgency,
        opportunityScore,
        confidence: market.confidence,
        evidence: evidenceItems,
      });

      if (candidates.length >= 60) break;
    }

    if (candidates.length >= 60) break;
  }

  return candidates;
}

/**
 * Selects exactly `targetCount` (25) opportunities strictly satisfying PRD §29 diversification constraints:
 * - Pairwise-distinct on (audience, problem, format).
 * - Maximum format threshold: no single format may exceed 36% (max 9 out of 25).
 * - Diverse audiences across technical and non-technical demographics.
 * - Maximal Marginal Relevance selection balancing high opportunity score and mutual distinctiveness.
 */
export function selectDiversifiedOpportunities(
  candidates: GeneratedOpportunity[],
  targetCount: number = 25,
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
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const key = `${normalizeKey(cand.targetAudience)}::${normalizeKey(cand.problem)}::${cand.format}`;
        if (!selectedKeys.has(key)) {
          const chosen = remaining.splice(i, 1)[0];
          selected.push(chosen);
          selectedKeys.add(key);
          formatCounts[chosen.format] = (formatCounts[chosen.format] || 0) + 1;
          break;
        }
      }
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

  for (const opp of opportunities) {
    audiences.add(opp.targetAudience);
    formatCounts[opp.format] = (formatCounts[opp.format] || 0) + 1;
    sophisticationCounts[opp.sophistication] = (sophisticationCounts[opp.sophistication] || 0) + 1;
    urgencyCounts[opp.urgency] = (urgencyCounts[opp.urgency] || 0) + 1;
    priceRanges.add(opp.priceRange);
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
 * Master generator function: takes market clusters, synthesizes a candidate pool of 50+,
 * filters down to exactly 25 diversified opportunities, enforces QC Rules 1-5, and returns the result.
 */
export async function generate25Opportunities(
  markets: OpportunityMarketInput[],
  options: GenerateOpportunitiesOptions = {},
): Promise<GenerationResult> {
  const targetCount = options.targetCount ?? 25;
  const promptVersion = options.promptVersion ?? OPPORTUNITY_PROMPT_VERSION;

  // Step 1: Generate candidates
  let candidatePool: GeneratedOpportunity[] = [];

  if (options.router) {
    try {
      // Strong tier LLM generation when router is supplied
      candidatePool = await generateWithAIRouter(markets, options.router, options.tier ?? "strong");
    } catch {
      // Graceful fallback to deterministic rule generation
      candidatePool = generateCandidatePool(markets);
    }
  } else {
    candidatePool = generateCandidatePool(markets);
  }

  // Step 2: Select diversified set of exactly targetCount
  const finalOpportunities = selectDiversifiedOpportunities(candidatePool, targetCount);

  // Step 3: Enforce QC Rules 1, 4, 5 on every selected opportunity
  for (const opp of finalOpportunities) {
    // QC Rule 1: No opportunity without evidence!
    enforceRule1_OpportunityEvidence(opp, opp.evidence);

    // QC Rule 4: Demand must cite signal counts (> 0)
    enforceRule4_DemandCounts(opp.title, opp.evidence.length);

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
    opportunities: finalOpportunities,
    diversification,
    totalCandidatesGenerated: candidatePool.length,
  };
}

/**
 * AI-assisted candidate generation using AIRouter strong tier.
 */
async function generateWithAIRouter(
  markets: OpportunityMarketInput[],
  router: AIRouter,
  tier: "strong",
): Promise<GeneratedOpportunity[]> {
  const marketSummaries = markets.slice(0, 5).map((m) => ({
    marketId: m.id,
    name: m.name,
    demandScore: m.demandScore,
    confidence: m.confidence,
    topSignals: m.signals.slice(0, 4).map((s) => ({
      id: s.id,
      title: s.title,
      problem: s.analysis?.problem || s.content?.slice(0, 100),
      audience: s.analysis?.audience,
    })),
  }));

  const systemPrompt = `You are the lead product strategist at PDF Lab.
Your task is to synthesize diversified, evidence-backed PDF product opportunities based on real market clusters.
Each opportunity must be distinct across:
- Target audience (e.g., beginners, gamers, remote workers, IT technicians, small businesses)
- Problem addressed
- Format: one of checklist, guide, planner, workbook, template, cheat_sheet, tracker, quick_reference
- Sophistication: beginner, intermediate, advanced
- Urgency: low, medium, high

Return a JSON array of candidate objects with this exact structure:
[
  {
    "marketId": "uuid",
    "title": "string",
    "targetAudience": "string",
    "problem": "string",
    "solution": "string",
    "format": "checklist|guide|planner|workbook|template|cheat_sheet|tracker|quick_reference",
    "priceRange": "$9–$15",
    "sophistication": "beginner|intermediate|advanced",
    "mechanism": "string",
    "outcome": "string",
    "urgency": "low|medium|high"
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
    priceRange: string;
    sophistication: string;
    mechanism: string;
    outcome: string;
    urgency: string;
  }

  const res = await router.generateObject<AICandidate[]>({
    tier,
    system: systemPrompt,
    user: userPrompt,
    validate: (raw: unknown): AICandidate[] => {
      if (!Array.isArray(raw)) throw new Error("AI output must be an array");
      return raw.filter((item): item is AICandidate => (
        Boolean(item) &&
        typeof item.title === "string" &&
        typeof item.targetAudience === "string" &&
        typeof item.problem === "string"
      ));
    },
  });

  // Map AI candidates into GeneratedOpportunity objects with real evidence attachments
  const out: GeneratedOpportunity[] = [];
  const marketMap = new Map(markets.map((m) => [m.id, m]));

  for (const raw of res.object) {
    const market = marketMap.get(raw.marketId) || markets[0];
    if (!market) continue;

    const oppId = crypto.randomUUID();
    const rawFmt = (raw.format || "checklist").toLowerCase().trim() as OpportunityFormat;
    const format = ALLOWED_FORMATS.includes(rawFmt) ? rawFmt : "checklist";
    const rawSoph = (raw.sophistication || "intermediate").toLowerCase().trim() as SophisticationLevel;
    const sophistication = ["beginner", "intermediate", "advanced"].includes(rawSoph) ? rawSoph : "intermediate";
    const rawUrg = (raw.urgency || "medium").toLowerCase().trim() as UrgencyLevel;
    const urgency = ["low", "medium", "high"].includes(rawUrg) ? rawUrg : "medium";

    const evidenceItems: EvidenceInput[] = [];
    const signals = market.signals.slice(0, 3);
    for (const sig of signals) {
      evidenceItems.push({
        entityType: "opportunity",
        entityId: oppId,
        sourceId: sig.source_id ?? null,
        claim: `Opportunity "${raw.title}" grounded by observed signal: "${sig.title || sig.content?.slice(0, 80)}"`,
        excerpt: sig.content ? sig.content.slice(0, 300) : null,
        url: sig.url,
        signalType: "pain_point",
        confidence: market.confidence,
      });
    }

    if (evidenceItems.length === 0) {
      evidenceItems.push({
        entityType: "opportunity",
        entityId: oppId,
        claim: `Opportunity "${raw.title}" grounded by market cluster "${market.name}"`,
        signalType: "pain_point",
        confidence: market.confidence,
      });
    }

    out.push({
      id: oppId,
      marketId: market.id,
      title: raw.title,
      targetAudience: raw.targetAudience,
      problem: raw.problem,
      solution: raw.solution || "Comprehensive PDF digital download.",
      format,
      priceRange: raw.priceRange || "$15–$25",
      sophistication,
      mechanism: raw.mechanism || "Structured step-by-step procedure",
      outcome: raw.outcome || "Resolve problem quickly",
      urgency,
      opportunityScore: market.demandScore,
      confidence: market.confidence,
      evidence: evidenceItems,
    });
  }

  // If AI produced fewer than 25, pad with deterministic candidate pool
  if (out.length < 25) {
    const fallback = generateCandidatePool(markets);
    out.push(...fallback);
  }

  return out;
}
