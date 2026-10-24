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
} from "../evidence/qc.ts";
import { mineReviewsAndGaps, type CompetitorProduct } from "../competition/index.ts";
import { isDemandOnly } from "../sources/demand-only.ts";

const STEP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Demand measurements, not discussions: they must not go through extraction or become market evidence.
function discussionsOnly<T extends { source_type: string; external_id?: string | null }>(rows: T[]): T[] {
  return rows.filter((s) => !isDemandOnly(s));
}
function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${STEP_TIMEOUT_MS}ms`));
    }, STEP_TIMEOUT_MS);
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
  opportunityScore: number;
  confidence: number;
}
export interface OrchestratorCompetitorItem {
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
  ingest: (params: { query: string; limit: number; sourceKeys?: string[] }) => Promise<{
    collected: number;
    normalized: number;
    inserted: number;
    sources: Array<{ key: string; status: string; count: number }>;
  }>;
  getSignals: (query: string) => Promise<StoredSignalForRun[]>;
  extract: (signals: Array<{ id: string; title: string | null; content: string | null; url: string | null }>) => Promise<{
    analyzed: number;
    succeeded: number;
    failed: number;
  }>;
  clusterAndScore: (signals: StoredSignalForRun[]) => Promise<OrchestratorMarketItem[]>;
  saveMarkets: (markets: OrchestratorMarketItem[]) => Promise<Array<{ id: string; name: string }>>;
  saveEvidence: (items: EvidenceInput[]) => Promise<EvidenceRow[]>;
  generateOpportunities: (markets: OrchestratorMarketItem[]) => Promise<Array<{
    opportunity: OrchestratorOpportunityItem;
    evidence: EvidenceInput[];
  }>>;
  saveOpportunities: (items: OrchestratorOpportunityItem[]) => Promise<Array<{ id: string; title: string }>>;
  observeCompetition: (signals: StoredSignalForRun[]) => Promise<OrchestratorCompetitorItem[]>;
  saveCompetitors?: (competitors: Array<{
    market_id: string;
    platform: string;
    title: string;
    url?: string | null;
    price?: string | null;
    rating?: number | null;
    review_count?: number | null;
  }>) => Promise<Array<{ id: string }>>;
  fetchCompleteness: (runId: string, query: string) => Promise<ResearchCompleteness>;
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

    const signals = discussionsOnly(await deps.getSignals(query));

    // 4. CLASSIFYING
    tracker.transition("classifying", {
      counts: { signalsAvailable: signals.length },
      message: `Analyzing signals with AIRouter for intent, urgency, and PDF relevance`,
    });
    await deps.updateRunStatus(runId, "classifying");

    const unanalyzedSignals = signals.filter((s) => !s.analysis);
    if (unanalyzedSignals.length > 0) {
      await withTimeout(deps.extract(
        unanalyzedSignals.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          url: s.url,
        })),
      ), "extract");
    }
    const freshSignals = discussionsOnly(await deps.getSignals(query));

    // 5. CLUSTERING
    tracker.transition("clustering", {
      counts: { signalsToCluster: freshSignals.length },
      message: `Clustering signals and evaluating market scoring formulas`,
    });
    await deps.updateRunStatus(runId, "clustering");

    const marketCandidates = await withTimeout(deps.clusterAndScore(freshSignals), "clusterAndScore");
    const savedMarkets = await deps.saveMarkets(marketCandidates);

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
          signalType: "pain_point",
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
      counts: { marketsChecked: marketCandidates.length },
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

    const observedCompetitors = await deps.observeCompetition(freshSignals);
    const compState = enforceRule3_CompetitionObserved(observedCompetitors);

    if (compState.hasCompetitors) {
      const primaryMarketId = marketCandidates[0]?.id || runId;

      if (deps.saveCompetitors && marketCandidates.length > 0) {
        await deps.saveCompetitors(
          observedCompetitors.map((c) => ({
            market_id: primaryMarketId,
            platform: c.platform,
            title: c.title,
            url: c.url,
            price: c.price,
            rating: c.rating,
            review_count: c.reviewCount,
          })),
        );
      }

      const compEvidenceItems: EvidenceInput[] = observedCompetitors.map((c) => ({
        entityType: "competition",
        entityId: primaryMarketId,
        claim: `Observed competitor on ${c.platform}: ${c.title}`,
        url: c.url,
        signalType: "competition_observed",
        confidence: 0.9,
      }));

      // Review mining -> likes/dislikes/missing/confusing/requests -> product gaps (PRD §21)
      const competitorProducts: CompetitorProduct[] = observedCompetitors.map((c) => ({
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
        freshSignals.map((s) => ({
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
            entityId: primaryMarketId,
            claim: `Product gap "${gap.title}": ${gap.opportunityTranslation}`,
            excerpt: excerpt.quote,
            url: excerpt.url,
            signalType: "competition_observed",
            confidence: 0.85,
          });
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

    const generatedPairs = await deps.generateOpportunities(marketCandidates);
    const validOpportunitiesToSave: OrchestratorOpportunityItem[] = [];
    const oppEvidenceToSave: EvidenceInput[] = [];

    for (const pair of generatedPairs) {
      // Enforce QC Rule 1: No opportunity without evidence!
      enforceRule1_OpportunityEvidence(pair.opportunity, pair.evidence);

      // Enforce QC Rule 4: Demand must cite signal counts
      enforceRule4_DemandCounts(pair.opportunity.title, pair.evidence.length);

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
      const saved = await deps.saveOpportunities(validOpportunitiesToSave);
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
        evidenceCreated: totalEvidenceCreated,
      },
      message: `Assembling research completeness panel and reconciling database counts`,
    });
    await deps.updateRunStatus(runId, "report_generation");

    const completeness = await deps.fetchCompleteness(runId, query);

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
      .fetchCompleteness(runId, query)
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
