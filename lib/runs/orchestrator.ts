// lib/runs/orchestrator.ts — Research run lifecycle orchestrator per docs/05-PIPELINE-SCORING.md.
// Walks through all 10 states:
// QUEUED -> COLLECTING -> NORMALIZING -> CLASSIFYING -> CLUSTERING -> TREND_ANALYSIS
//   -> COMPETITION_ANALYSIS -> OPPORTUNITY_GENERATION -> REPORT_GENERATION -> COMPLETED

import type { LifecycleState, ResearchCompleteness, RunSummary } from "./types.ts";
import { LifecycleTracker } from "./lifecycle.ts";
import type { EvidenceInput, EvidenceRow } from "../evidence/types.ts";
import {
  enforceRule1_OpportunityEvidence,
  enforceRule2_TrendTemporalEvidence,
  enforceRule3_CompetitionObserved,
  enforceRule4_DemandCounts,
  enforceRule5_SeparationOfConcerns,
  sourcedEvidenceCount,
} from "../evidence/qc.ts";
import { mineReviewsAndGaps, type CompetitorProduct } from "../competition/index.ts";
import { marketForCompetitor } from "../competition/map.ts";
import { isDemandOnly, isListing } from "../sources/demand-only.ts";
import { IDEA_CLAIM_PREFIX } from "../opportunities/from-ideas.ts";
import { evidenceSignalType, observedPriceRange } from "../opportunities/generator.ts";
import { OPPORTUNITY_TARGET } from "../opportunities/types.ts";

const STEP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
// Extraction is batched (Part 6.9), but a slow provider can still take a minute per call and a
// batch can fall back to single retries. Budget 10 s per signal, never under 5 minutes.
export const EXTRACT_MS_PER_SIGNAL = 10_000;
// shortcut: 50 % is a first guess; revisit once runs on several seeds show the usual analysed share.
/** A run whose analysed share of discussion signals is below this fails instead of reporting on scraps. */
export const MIN_ANALYZED_SHARE = 0.5;

// Demand measurements and marketplace listings are not discussions: they must not go through
// extraction or clustering, or become market evidence. Listings feed competition analysis instead.
function discussionsOnly<T extends { source_type: string; external_id?: string | null }>(rows: T[]): T[] {
  return rows.filter((s) => !isDemandOnly(s) && !isListing(s));
}
function withTimeout<T>(p: Promise<T>, label: string, ms = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    p.then((val) => {
      clearTimeout(timer);
      resolve(val);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export interface ResearchRunOptions {
  query: string;
  mode?: "explore" | "validate" | "hunt" | "deep" | "monitor";
  limit?: number;
  sourceKeys?: string[];
  userId?: string | null;
  /** Planner rule-set version + structured plan (Phase 3.4), persisted on the run row. */
  promptVersion?: string | null;
  plan?: unknown;
  /** The seed as the user typed it; its stored quick ideas join the pool. Defaults to `query`. */
  seed?: string;
}

export interface StoredSignalForRun {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  source_id: string;
  source_type: string;
  external_id?: string | null;
  published_at?: string | null;
  analysis?: {
    id: string;
    audience: string;
    problem: string;
    intent: string;
    urgency: string;
    pdf_relevance: number;
    embedding: number[] | null;
  } | null;
}

export interface OrchestratorMarketItem {
  id: string;
  name: string;
  clusterId?: string;
  trend: string;
  demandScore: number;
  confidence: number;
  pdfFitScore: number;
  /** Paid price range of the competitors stored against this market in this run; null = not observed. */
  priceRange?: string | null;
  signals: StoredSignalForRun[];
}

export interface OrchestratorOpportunityItem {
  id: string;
  marketId: string;
  title: string;
  targetAudience: string;
  problem: string;
  solution: string;
  format: string;
  priceRange?: string | null;
  opportunityScore: number;
  confidence: number;
  /** Signals of the market that match this problem, of `marketSignals` (QC Rule 4, Part 6.8). */
  matchingSignals?: number | null;
  marketSignals?: number | null;
}
export interface OrchestratorCompetitorItem {
  /** The stored listing row this competitor was read from. */
  signalId?: string | null;
  platform: string;
  title: string;
  url?: string | null;
  price?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  format?: string;
  positioning?: string | null;
  promises?: string[];
  reviews?: string[];
}

export interface OrchestratorDeps {
  createRun: (run: {
    query: string;
    mode: string;
    userId?: string | null;
    promptVersion?: string | null;
    plan?: unknown;
  }) => Promise<{
    id: string;
    started_at: string;
  }>;
  updateRunStatus: (
    id: string,
    status: LifecycleState,
    completedAt?: string | null,
  ) => Promise<void>;
  /** Collects, stores, and links every returned signal to the run (`run_signals`). */
  ingest: (params: { runId: string; query: string; limit: number; sourceKeys?: string[] }) => Promise<{
    collected: number;
    normalized: number;
    inserted: number;
    sources: Array<{ key: string; status: string; count: number }>;
  }>;
  /** The run's own signals (`run_signals`), never a text match over the whole table. */
  getSignals: (runId: string) => Promise<StoredSignalForRun[]>;
  extract: (signals: Array<{ id: string; title: string | null; content: string | null; url: string | null }>) => Promise<{
    analyzed: number;
    succeeded: number;
    failed: number;
    /** Model calls the extraction made. */
    calls?: number;
  }>;
  clusterAndScore: (signals: StoredSignalForRun[]) => Promise<OrchestratorMarketItem[]>;
  saveMarkets: (markets: OrchestratorMarketItem[], runId: string) => Promise<Array<{ id: string; name: string }>>;
  saveEvidence: (items: EvidenceInput[]) => Promise<EvidenceRow[]>;
  /** `seed`: the stored quick ideas of this seed join the candidate pool (Part 3.8). */
  generateOpportunities: (markets: OrchestratorMarketItem[], seed: string) => Promise<Array<{
    opportunity: OrchestratorOpportunityItem;
    evidence: EvidenceInput[];
  }>>;
  saveOpportunities: (items: OrchestratorOpportunityItem[], runId: string) => Promise<Array<{ id: string; title: string }>>;
  observeCompetition: (signals: StoredSignalForRun[]) => Promise<OrchestratorCompetitorItem[]>;
  saveCompetitors?: (competitors: Array<{
    run_id: string;
    /** null: the listing overlaps no market of the run and stays attached to the run only. */
    market_id: string | null;
    platform: string;
    title: string;
    url?: string | null;
    price?: string | null;
    rating?: number | null;
    review_count?: number | null;
  }>) => Promise<Array<{ id: string }>>;
  fetchCompleteness: (runId: string) => Promise<ResearchCompleteness>;
}

export async function executeResearchRun(
  options: ResearchRunOptions,
  deps: OrchestratorDeps,
): Promise<RunSummary> {
  const query = options.query?.trim();
  if (!query) {
    throw new Error("Research run requires a non-empty query");
  }
  const mode = options.mode || "deep";
  const limit = options.limit || 25;

  // 1. QUEUED
  const runRecord = await deps.createRun({
    query,
    mode,
    userId: options.userId,
    promptVersion: options.promptVersion,
    plan: options.plan,
  });
  const runId = runRecord.id;
  const tracker = new LifecycleTracker("queued", `Research run queued for "${query}"`);

  let totalEvidenceCreated = 0;
  const allCreatedEvidence: EvidenceRow[] = [];

  try {
    // 2. COLLECTING
    tracker.transition("collecting", { message: `Collecting signals from adapters for "${query}"` });
    await deps.updateRunStatus(runId, "collecting");
    const ingestResult = await withTimeout(deps.ingest({
      runId,
      query,
      limit,
      sourceKeys: options.sourceKeys,
    }), "ingest");

    // 3. NORMALIZING
    tracker.transition("normalizing", {
      counts: {
        collected: ingestResult.collected,
        normalized: ingestResult.normalized,
        inserted: ingestResult.inserted,
      },
      message: `Normalized ${ingestResult.normalized} signals across ${ingestResult.sources.length} sources`,
    });
    await deps.updateRunStatus(runId, "normalizing");

    const signals = discussionsOnly(await deps.getSignals(runId));

    // 4. CLASSIFYING
    tracker.transition("classifying", {
      counts: { signalsAvailable: signals.length },
      message: `Analyzing signals with AIRouter for intent, urgency, and PDF relevance`,
    });
    await deps.updateRunStatus(runId, "classifying");

    const unanalyzedSignals = signals.filter((s) => !s.analysis);
    let extraction: { failed: number; calls?: number } = { failed: 0, calls: 0 };
    if (unanalyzedSignals.length > 0) {
      extraction = await withTimeout(deps.extract(
        unanalyzedSignals.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          url: s.url,
        })),
      ), "extract", Math.max(STEP_TIMEOUT_MS, unanalyzedSignals.length * EXTRACT_MS_PER_SIGNAL));
    }
    const runSignals = await deps.getSignals(runId);
    const freshSignals = discussionsOnly(runSignals);

    // A run that analysed too little fails here instead of reporting on scraps (Part 6.9).
    const analyzedCount = freshSignals.filter((s) => s.analysis).length;
    const notAnalyzed = freshSignals.length - analyzedCount;
    if (freshSignals.length > 0 && analyzedCount / freshSignals.length < MIN_ANALYZED_SHARE) {
      throw new Error(
        `Only ${analyzedCount} of ${freshSignals.length} signals were analysed ` +
          `(${extraction.failed} extraction failures in this run); a run needs at least ${Math.round(MIN_ANALYZED_SHARE * 100)}%.`,
      );
    }

    // 5. CLUSTERING
    tracker.transition("clustering", {
      counts: {
        signalsToCluster: freshSignals.length,
        signalsAnalyzed: analyzedCount,
        signalsNotAnalyzed: notAnalyzed,
        extractionFailures: extraction.failed,
        extractionCalls: extraction.calls ?? 0,
      },
      message:
        notAnalyzed > 0
          ? `Partial: ${analyzedCount} of ${freshSignals.length} signals analysed; clustering those`
          : `Clustering signals and evaluating market scoring formulas`,
    });
    await deps.updateRunStatus(runId, "clustering");

    const marketCandidates = await withTimeout(deps.clusterAndScore(freshSignals), "clusterAndScore");
    // The clusterer skips a signal with no embedding; say how many (clusterAndScore fills them in place).
    const unembedded = freshSignals.filter((s) => s.analysis && !s.analysis.embedding?.length).length;
    const savedMarkets = await deps.saveMarkets(marketCandidates, runId);

    // Write evidence for each market from its supporting signals
    const marketEvidenceItems: EvidenceInput[] = [];
    for (let i = 0; i < marketCandidates.length; i++) {
      const candidate = marketCandidates[i];
      const saved = savedMarkets[i] || { id: candidate.id, name: candidate.name };
      candidate.id = saved.id; // ensure UUID is set

      // Back each market with evidence from its signals
      for (const sig of candidate.signals.slice(0, 5)) {
        marketEvidenceItems.push({
          entityType: "market",
          entityId: saved.id,
          sourceId: sig.source_id,
          claim: `Market "${saved.name}" evidenced by discussion: ${sig.title || "signal"}`,
          excerpt: sig.content ? sig.content.slice(0, 300) : null,
          url: sig.url,
          signalType: evidenceSignalType(sig),
          confidence: candidate.confidence,
        });
      }
    }

    if (marketEvidenceItems.length > 0) {
      const written = await deps.saveEvidence(marketEvidenceItems);
      totalEvidenceCreated += written.length;
      allCreatedEvidence.push(...written);
    }

    // 6. TREND_ANALYSIS
    tracker.transition("trend_analysis", {
      counts: { marketsChecked: marketCandidates.length, signalsUnembedded: unembedded },
      message: `Evaluating temporal evidence and trend velocity`,
    });
    await deps.updateRunStatus(runId, "trend_analysis");

    const trendEvidenceItems: EvidenceInput[] = [];
    for (const market of marketCandidates) {
      // Evaluate temporal evidence
      const temporalSignals = market.signals.filter((s) => s.published_at || s.source_type === "gtrends");
      const proposedTrend = temporalSignals.length < 2 ? "unknown" : (market.trend || "unknown");
      const validatedTrend = enforceRule2_TrendTemporalEvidence(
        proposedTrend,
        temporalSignals.length,
      );
      market.trend = validatedTrend;

      trendEvidenceItems.push({
        entityType: "trend",
        entityId: market.id,
        claim:
          validatedTrend === "unknown"
            ? `Trend classified as "unknown" due to insufficient temporal history (${temporalSignals.length} observations, requires >= 2 per PRD §53/§54)`
            : `Trend verified as "${validatedTrend}" supported by ${temporalSignals.length} temporal data points`,
        signalType: "trend_signal",
        confidence: validatedTrend === "unknown" ? 0.25 : market.confidence,
      });
    }

    if (trendEvidenceItems.length > 0) {
      const written = await deps.saveEvidence(trendEvidenceItems);
      totalEvidenceCreated += written.length;
      allCreatedEvidence.push(...written);
    }

    // 7. COMPETITION_ANALYSIS
    tracker.transition("competition_analysis", {
      message: `Mining competition and checking observed product density`,
    });
    await deps.updateRunStatus(runId, "competition_analysis");

    // Listings (never extracted) plus discussion rows from store hosts.
    const observedCompetitors = await deps.observeCompetition(runSignals.filter((s) => !isDemandOnly(s)));
    const compState = enforceRule3_CompetitionObserved(observedCompetitors);

    if (compState.hasCompetitors) {
      // Each listing goes to the market it was clustered into or overlaps best; below the minimum
      // overlap it stays on the run only (Part 6.7), never on the first market.
      const mapTargets = marketCandidates.map((m) => ({
        id: m.id,
        name: m.name,
        signalIds: m.signals.map((s) => s.id),
        texts: m.signals.map((s) => s.analysis?.problem || s.title || ""),
      }));
      const seedText = options.seed?.trim() || query;
      const assigned = observedCompetitors.map((c) => ({
        competitor: c,
        marketId: marketForCompetitor(c, mapTargets, seedText),
      }));

      if (deps.saveCompetitors) {
        await deps.saveCompetitors(
          assigned.map(({ competitor: c, marketId }) => ({
            run_id: runId,
            market_id: marketId,
            platform: c.platform,
            title: c.title,
            url: c.url,
            price: c.price,
            rating: c.rating,
            review_count: c.reviewCount,
          })),
        );
      }

      // An unmapped listing is still an observation of the run: its evidence hangs off the run id.
      const compEvidenceItems: EvidenceInput[] = assigned.map(({ competitor: c, marketId }) => ({
        entityType: "competition",
        entityId: marketId ?? runId,
        claim: `Observed competitor on ${c.platform}: ${c.title}`,
        url: c.url,
        signalType: "competition_observed",
        confidence: 0.9,
      }));

      for (const market of marketCandidates) {
        const own = assigned.filter((a) => a.marketId === market.id).map((a) => a.competitor);
        if (own.length === 0) continue; // no observed product, so no price range and no product gap
        market.priceRange = observedPriceRange(own.map((c) => c.price));

        // Review mining -> likes/dislikes/missing/confusing/requests -> product gaps (PRD §21)
        const competitorProducts: CompetitorProduct[] = own.map((c) => ({
          platform: c.platform,
          title: c.title,
          url: c.url || null,
          price: c.price || null,
          format: c.format || "guide",
          rating: c.rating || null,
          reviewCount: c.reviewCount || null,
          positioning: c.positioning || null,
          promises: c.promises || [],
          reviews: c.reviews || [],
        }));
        const { productGaps } = mineReviewsAndGaps(
          competitorProducts,
          market.signals.map((s) => ({
            title: s.title,
            content: s.content,
            url: s.url,
            source_type: s.source_type,
          })),
        );

        // Add product gaps with quoted review excerpts as competition evidence
        for (const gap of productGaps) {
          for (const excerpt of gap.reviewExcerpts) {
            compEvidenceItems.push({
              entityType: "competition",
              entityId: market.id,
              claim: `Product gap "${gap.title}": ${gap.opportunityTranslation}`,
              excerpt: excerpt.quote,
              url: excerpt.url,
              signalType: "competition_observed",
              confidence: 0.85,
            });
          }
        }
      }

      const written = await deps.saveEvidence(compEvidenceItems);
      totalEvidenceCreated += written.length;
      allCreatedEvidence.push(...written);
    }

    // 8. OPPORTUNITY_GENERATION
    tracker.transition("opportunity_generation", {
      message: `Generating evidence-backed PDF opportunities with QC Rule 1 enforcement`,
    });
    await deps.updateRunStatus(runId, "opportunity_generation");

    const generatedPairs = await deps.generateOpportunities(marketCandidates, options.seed?.trim() || query);
    const fromIdeas = generatedPairs.filter((p) => p.evidence.some((e) => e.claim.startsWith(IDEA_CLAIM_PREFIX))).length;
    const validOpportunitiesToSave: OrchestratorOpportunityItem[] = [];
    const oppEvidenceToSave: EvidenceInput[] = [];

    let droppedUnsourced = 0;
    for (const pair of generatedPairs) {
      // QC Rule 1: an opportunity with no sourced evidence row is dropped, not saved (Part 6.8).
      if (sourcedEvidenceCount(pair.opportunity.id, pair.evidence) === 0) {
        droppedUnsourced++;
        continue;
      }
      enforceRule1_OpportunityEvidence(pair.opportunity, pair.evidence);

      // QC Rule 4: demand cites the signals that match this opportunity's problem, not its row count.
      enforceRule4_DemandCounts(
        pair.opportunity.title,
        pair.opportunity.matchingSignals ?? sourcedEvidenceCount(pair.opportunity.id, pair.evidence),
      );

      // Enforce QC Rule 5: Separation of concerns
      enforceRule5_SeparationOfConcerns({
        facts: pair.evidence.map((e) => ({
          excerpt: e.excerpt,
          url: e.url,
          source_id: e.sourceId,
        })),
        interpretation: { confidence: pair.opportunity.confidence },
        suggestion: { solution: pair.opportunity.solution, format: pair.opportunity.format },
      });

      validOpportunitiesToSave.push(pair.opportunity);
      oppEvidenceToSave.push(...pair.evidence);
    }

    let savedOppsCount = 0;
    if (validOpportunitiesToSave.length > 0) {
      const saved = await deps.saveOpportunities(validOpportunitiesToSave, runId);
      savedOppsCount = saved.length;

      if (oppEvidenceToSave.length > 0) {
        const written = await deps.saveEvidence(oppEvidenceToSave);
        totalEvidenceCreated += written.length;
        allCreatedEvidence.push(...written);
      }
    }

    // 9. REPORT_GENERATION
    tracker.transition("report_generation", {
      counts: {
        opportunities: savedOppsCount,
        opportunitiesFromIdeas: fromIdeas,
        opportunitiesDroppedUnsourced: droppedUnsourced,
        evidenceCreated: totalEvidenceCreated,
      },
      message:
        `Saved ${savedOppsCount} of ${OPPORTUNITY_TARGET} target opportunities` +
        (savedOppsCount < OPPORTUNITY_TARGET ? ", limited by evidence" : "") +
        `; assembling research completeness panel and reconciling database counts`,
    });
    await deps.updateRunStatus(runId, "report_generation");

    const completeness = await deps.fetchCompleteness(runId);

    // 10. COMPLETED (Invariant: zero-evidence run is forbidden per 05-PIPELINE-SCORING)
    if (completeness.evidenceCount === 0 && totalEvidenceCreated === 0) {
      throw new Error(
        "Run produced zero evidence rows; refusing to mark COMPLETED per 05-PIPELINE-SCORING lifecycle invariant.",
      );
    }

    const completedAt = new Date().toISOString();
    tracker.transition("completed", {
      counts: {
        completeness: completeness.completenessPercentage,
        evidenceTotal: completeness.evidenceCount,
      },
      message: `Research run completed successfully with ${completeness.completenessPercentage}% completeness`,
    });
    await deps.updateRunStatus(runId, "completed", completedAt);

    return {
      runId,
      query,
      mode,
      status: "completed",
      startedAt: runRecord.started_at,
      completedAt,
      trace: tracker.getTrace(),
      completeness,
      counts: {
        sources: completeness.sourcesCovered,
        signalsCollected: completeness.signalsCollected,
        signalsAnalyzed: completeness.signalsAnalyzed,
        marketsCreated: completeness.marketsIdentified,
        opportunitiesCreated: completeness.opportunitiesGenerated,
        evidenceCount: completeness.evidenceCount,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (tracker.getCurrentState() !== "failed") {
      tracker.transition("failed", { message: errorMsg });
    }
    await deps.updateRunStatus(runId, "failed");

    const completeness = await deps
      .fetchCompleteness(runId)
      .catch(() => ({
        sourcesCovered: 0,
        signalsCollected: 0,
        signalsAnalyzed: 0,
        marketsIdentified: 0,
        opportunitiesGenerated: 0,
        evidenceCount: totalEvidenceCreated,
        evidenceBackedOpportunitiesCount: 0,
        completenessPercentage: 0,
      }));

    return {
      runId,
      query,
      mode,
      status: "failed",
      startedAt: runRecord.started_at,
      completedAt: null,
      error: errorMsg,
      trace: tracker.getTrace(),
      completeness,
      counts: {
        sources: completeness.sourcesCovered,
        signalsCollected: completeness.signalsCollected,
        signalsAnalyzed: completeness.signalsAnalyzed,
        marketsCreated: completeness.marketsIdentified,
        opportunitiesCreated: completeness.opportunitiesGenerated,
        evidenceCount: totalEvidenceCreated,
      },
    };
  }
}
