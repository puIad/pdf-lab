// lib/runs/orchestrator.ts — Research run lifecycle orchestrator per docs/PIPELINE-SCORING.md.
// Walks through all 10 states:
// QUEUED -> COLLECTING -> NORMALIZING -> CLASSIFYING -> CLUSTERING -> TREND_ANALYSIS
//   -> COMPETITION_ANALYSIS -> OPPORTUNITY_GENERATION -> REPORT_GENERATION -> COMPLETED

import type { LifecycleState, LifecycleTraceStep, ResearchCompleteness, RunSummary, RunWork } from "./types.ts";
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
import { listingFormat, mineReviewsAndGaps, type CompetitorProduct } from "../competition/index.ts";
import { placeCompetitor } from "../competition/map.ts";
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
export function discussionsOnly<T extends { source_type: string; external_id?: string | null }>(rows: T[]): T[] {
  return rows.filter((s) => !isDemandOnly(s) && !isListing(s));
}
/** QC Rule 2: a trend other than "unknown" needs at least 2 dated observations. */
function validatedTrend(market: { trend: string; signals: StoredSignalForRun[] }): { trend: string; temporalCount: number } {
  const temporalCount = market.signals.filter((s) => s.published_at || s.source_type === "gtrends").length;
  const proposed = temporalCount < 2 ? "unknown" : market.trend || "unknown";
  return { trend: enforceRule2_TrendTemporalEvidence(proposed, temporalCount), temporalCount };
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
  /** Stored `signals.engagement`; scoring reads its named keys (Part 6.11). */
  engagement?: Record<string, unknown> | null;
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
  /** Null when the wording names no format ("Not observed"). */
  format: string | null;
  priceRange?: string| null;
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
  /**
   * The array may carry `droppedUnsourced` (candidates the generator removed for lacking sourced
   * evidence) and `ideasInNoMarket` (quick ideas left out because their words are in no market).
   */
  generateOpportunities: (markets: OrchestratorMarketItem[], seed: string) => Promise<Array<{
    opportunity: OrchestratorOpportunityItem;
    evidence: EvidenceInput[];
  }> & { droppedUnsourced?: number; ideasInNoMarket?: number; mergedSimilar?: number }>;
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
  /**
   * Adds to the run's stored work figures (`activeMs` and `listingsDropped` are summed, the rest
   * replace) and returns the merged whole. Optional: a run without it reports its own numbers.
   */
  recordRunWork?: (runId: string, patch: Partial<RunWork>) => Promise<RunWork>;
}

/** What every phase of one run needs to know about it. */
export interface RunFrame {
  runId: string;
  query: string;
  mode: string;
  startedAt: string;
  /** The seed as the user typed it; its stored quick ideas join the candidate pool. */
  seed: string;
}

type ExtractionCounts = { failed: number; calls?: number };

async function openRun(options: ResearchRunOptions, deps: OrchestratorDeps): Promise<{ frame: RunFrame; tracker: LifecycleTracker }> {
  const query = options.query?.trim();
  if (!query) {
    throw new Error("Research run requires a non-empty query");
  }
  const mode = options.mode || "deep";

  // 1. QUEUED
  const runRecord = await deps.createRun({
    query,
    mode,
    userId: options.userId,
    promptVersion: options.promptVersion,
    plan: options.plan,
  });
  return {
    frame: { runId: runRecord.id, query, mode, startedAt: runRecord.started_at, seed: options.seed?.trim() || query },
    tracker: new LifecycleTracker("queued", `Research run queued for "${query}"`),
  };
}

/** States collecting → normalizing → classifying. Returns the run's discussion signals. */
async function collectSignals(
  frame: RunFrame,
  options: ResearchRunOptions,
  deps: OrchestratorDeps,
  tracker: LifecycleTracker,
  classifyingMessage: string,
) {
  const { runId, query } = frame;

  // 2. COLLECTING
  tracker.transition("collecting", { message: `Collecting signals from adapters for "${query}"` });
  await deps.updateRunStatus(runId, "collecting");
  const ingestResult = await withTimeout(deps.ingest({
    runId,
    query,
    limit: options.limit || 25,
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
    message: classifyingMessage,
  });
  await deps.updateRunStatus(runId, "classifying");
  await deps.recordRunWork?.(runId, { adapterCalls: ingestResult.sources.length }).catch(() => undefined);
  return { signals, ingestResult };
}

const activeMsOf = (tracker: LifecycleTracker) => tracker.getTrace().reduce((n, s) => n + (s.durationMs ?? 0), 0);

/** Marks the run failed and builds its summary. */
async function failRun(
  frame: RunFrame,
  deps: OrchestratorDeps,
  tracker: LifecycleTracker,
  err: unknown,
  evidenceCreated: number,
): Promise<RunSummary> {
  const { runId, query, mode } = frame;
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
      evidenceCount: evidenceCreated,
      evidenceBackedOpportunitiesCount: 0,
      completenessPercentage: 0,
    }));

  return {
    runId,
    query,
    mode,
    status: "failed",
    startedAt: frame.startedAt,
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
      evidenceCount: evidenceCreated,
    },
  };
}

/**
 * Everything after classification: the analysed-share gate, clustering, trend, competition,
 * opportunities, report. Reads the run's signals from the DB, so it also finishes a run whose
 * analyses arrived in a later request (a pasted reply, Part 6.15).
 */
async function finishRun(
  frame: RunFrame,
  deps: OrchestratorDeps,
  tracker: LifecycleTracker,
  extraction: ExtractionCounts,
): Promise<RunSummary> {
  const { runId, query, mode } = frame;
  let totalEvidenceCreated = 0;
  const allCreatedEvidence: EvidenceRow[] = [];

  try {
    let droppedOffTopic = 0;
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
    // Analysed signals that ended up in no market: the clusterer skips one with no embedding, and a
    // pasted reply can mark one as unrelated to the topic. Say how many.
    const clustered = new Set(marketCandidates.flatMap((m) => m.signals.map((s) => s.id)));
    const notClustered = freshSignals.filter((s) => s.analysis && !clustered.has(s.id)).length;
    // Validate before saving: the stored trend is the checked one, never the summarizer's guess.
    for (const market of marketCandidates) market.trend = validatedTrend(market).trend;
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
      counts: { marketsChecked: marketCandidates.length, signalsNotClustered: notClustered },
      message: `Evaluating temporal evidence and trend velocity`,
    });
    await deps.updateRunStatus(runId, "trend_analysis");

    const trendEvidenceItems: EvidenceInput[] = [];
    for (const market of marketCandidates) {
      const { trend: validatedTrendLabel, temporalCount } = validatedTrend(market);

      trendEvidenceItems.push({
        entityType: "trend",
        entityId: market.id,
        claim:
          validatedTrendLabel === "unknown"
            ? `Trend classified as "unknown" due to insufficient temporal history (${temporalCount} observations, requires >= 2 per PRD §53/§54)`
            : `Trend verified as "${validatedTrendLabel}" supported by ${temporalCount} temporal data points`,
        signalType: "trend_signal",
        confidence: validatedTrendLabel === "unknown" ? 0.25 : market.confidence,
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
      const seedText = frame.seed;
      const placed = observedCompetitors.map((c) => ({ competitor: c, ...placeCompetitor(c, mapTargets, seedText) }));
      const assigned = placed.filter((p) => p.relevant);
      droppedOffTopic = placed.length - assigned.length;

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
          format: c.format || listingFormat(c.title),
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

    const generatedPairs = await deps.generateOpportunities(marketCandidates, frame.seed);
    const fromIdeas = generatedPairs.filter((p) => p.evidence.some((e) => e.claim.startsWith(IDEA_CLAIM_PREFIX))).length;
    const validOpportunitiesToSave: OrchestratorOpportunityItem[] = [];
    const oppEvidenceToSave: EvidenceInput[] = [];

    let droppedUnsourced = generatedPairs.droppedUnsourced ?? 0;
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
        ideasInNoMarket: generatedPairs.ideasInNoMarket ?? 0,
        opportunitiesMergedSimilar: generatedPairs.mergedSimilar ?? 0,
        evidenceCreated: totalEvidenceCreated,
      },
      message:
        `Saved ${savedOppsCount} of ${OPPORTUNITY_TARGET} target opportunities` +
        (savedOppsCount < OPPORTUNITY_TARGET ? ", limited by evidence" : "") +
        (generatedPairs.mergedSimilar ? `; ${generatedPairs.mergedSimilar} merged into another with the same audience and problem` : "") +
        (generatedPairs.ideasInNoMarket ? `; ${generatedPairs.ideasInNoMarket} quick ideas fit no market and were left out` : "") +
        `; assembling research completeness panel and reconciling database counts`,
    });
    await deps.updateRunStatus(runId, "report_generation");

    const completeness = await deps.fetchCompleteness(runId);

    // 10. COMPLETED (Invariant: zero-evidence run is forbidden per PIPELINE-SCORING)
    if (completeness.evidenceCount === 0 && totalEvidenceCreated === 0) {
      throw new Error(
        "Run produced zero evidence rows; refusing to mark COMPLETED per PIPELINE-SCORING lifecycle invariant.",
      );
    }

    const completedAt = new Date().toISOString();
    const own = { activeMs: activeMsOf(tracker), extractionCalls: extraction.calls ?? 0, listingsDropped: droppedOffTopic };
    const stored = await deps.recordRunWork?.(runId, own).catch(() => undefined);
    const work: RunWork = stored ?? { adapterCalls: 0, tokens: null, ...own };
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
      startedAt: frame.startedAt,
      completedAt,
      trace: tracker.getTrace(),
      completeness,
      work,
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
    return failRun(frame, deps, tracker, err, totalEvidenceCreated);
  }
}

/** A Deep run in one request: collect, extract with the AIRouter, analyse, report. */
export async function executeResearchRun(
  options: ResearchRunOptions,
  deps: OrchestratorDeps,
): Promise<RunSummary> {
  const { frame, tracker } = await openRun(options, deps);
  let extraction: ExtractionCounts = { failed: 0, calls: 0 };
  try {
    const { signals } = await collectSignals(frame, options, deps, tracker, "Analyzing signals with AIRouter for intent, urgency, and PDF relevance");
    const unanalyzedSignals = signals.filter((s) => !s.analysis);
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
  } catch (err) {
    return failRun(frame, deps, tracker, err, 0);
  }
  return finishRun(frame, deps, tracker, extraction);
}

export interface PausedRun {
  status: "awaiting_reply";
  frame: RunFrame;
  /** The run's discussion signals; `promptSignals` (lib/runs/pasted.ts) fixes their prompt order. */
  signals: StoredSignalForRun[];
  sources: Array<{ key: string; status: string; count: number }>;
  trace: LifecycleTraceStep[];
}

/**
 * First half of a Deep run whose analysis is done outside PDF Lab (Part 6.15, DEC-015): collect,
 * then stop in `classifying` and hand back the signals for the prompt. No model is called.
 */
export async function startPastedRun(options: ResearchRunOptions, deps: OrchestratorDeps): Promise<PausedRun | RunSummary> {
  const { frame, tracker } = await openRun(options, deps);
  try {
    const { signals, ingestResult } = await collectSignals(frame, options, deps, tracker, "Waiting for the pasted model reply");
    if (signals.length === 0) throw new Error("No discussion signal was collected for this seed; there is nothing to analyse.");
    await deps.recordRunWork?.(frame.runId, { activeMs: activeMsOf(tracker) }).catch(() => undefined);
    return { status: "awaiting_reply", frame, signals, sources: ingestResult.sources, trace: tracker.getTrace() };
  } catch (err) {
    return failRun(frame, deps, tracker, err, 0);
  }
}

/** Second half: the analyses are stored; cluster, score and report. `failed` = items the reply got wrong. */
export async function finishPastedRun(frame: RunFrame, deps: OrchestratorDeps, failed: number): Promise<RunSummary> {
  const tracker = new LifecycleTracker("classifying", "Pasted model reply stored");
  return finishRun(frame, deps, tracker, { failed, calls: 0 });
}
