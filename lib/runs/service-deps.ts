// lib/runs/service-deps.ts — Production service-role dependencies for the research run orchestrator.
// Server-only: connects real Supabase client, AIRouter, ingest, and clustering pipelines.

import { createServiceSupabaseClient } from "../db/client.ts";
import { runIngest } from "../ingest/pipeline.ts";
import { getServiceDeps as createServerIngestDeps } from "../ingest/service-deps.ts";
import { getRouter, runExtractionJob } from "../ai/index.ts";
import { clusterSignals } from "../cluster/clusterer.ts";
import type { ClusterSignal } from "../cluster/types.ts";
import { writeEvidence } from "../evidence/writer.ts";
import { createServerEvidenceDeps } from "../evidence/service-deps.ts";
import { fetchRunCompleteness } from "./completeness.ts";
import { buildSearchFilter } from "../db/search.ts";
import { generate25Opportunities, type OpportunityMarketInput } from "../opportunities/index.ts";
import type { OrchestratorDeps, OrchestratorCompetitorItem } from "./orchestrator.ts";
import { parseMarketplaceProduct } from "../sources/marketplace-helper.ts";

const EXPECTED_EMBEDDING_DIM = 1536;

function parseVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string") {
    try {
      const trimmed = v.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return JSON.parse(trimmed).map(Number);
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function createServerOrchestratorDeps(): OrchestratorDeps {
  const supabase = createServiceSupabaseClient();
  const router = getRouter();

  return {
    createRun: async ({ query, mode, userId }) => {
      const { data, error } = await supabase
        .from("research_runs")
        .insert({
          query,
          mode: mode || "deep",
          user_id: userId || null,
          status: "queued",
        })
        .select("id, started_at")
        .single();

      if (error || !data) {
        throw new Error(`Failed to create research_run: ${error?.message}`);
      }

      return { id: data.id, started_at: data.started_at };
    },

    updateRunStatus: async (id, status, completedAt) => {
      const payload: { status: string; completed_at?: string } = { status };
      if (completedAt) payload.completed_at = completedAt;

      const { error } = await supabase.from("research_runs").update(payload).eq("id", id);
      if (error) {
        console.error(`Failed to update run status to ${status}:`, error.message);
      }
    },

    ingest: async ({ query, limit, sourceKeys }) => {
      const ingestDeps = createServerIngestDeps();
      const res = await runIngest({ query, limit, sourceKeys }, ingestDeps);
      return {
        collected: res.totals.collected,
        normalized: res.totals.normalized,
        inserted: res.totals.inserted,
        sources: res.sources.map((s) => ({
          key: s.key,
          status: s.status,
          count: s.collected,
        })),
      };
    },

    getSignals: async (query) => {
      const filter = buildSearchFilter(query);
      let queryBuilder = supabase
        .from("signals")
        .select(`
          id, title, content, url, source_id, published_at,
          sources ( type ),
          signal_analysis (
            id, audience, problem, intent, urgency, pdf_relevance, embedding
          )
        `);

      if (filter) {
        queryBuilder = queryBuilder.or(filter);
      }

      const { data, error } = await queryBuilder.order("collected_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch signals for run: ${error.message}`);
      }

      const rows = (data || []) as unknown as Array<{
        id: string;
        title: string | null;
        content: string | null;
        url: string | null;
        source_id: string;
        published_at: string | null;
        sources?: { type: string } | null;
        signal_analysis?: Array<{
          id: string;
          audience: string;
          problem: string;
          intent: string;
          urgency: string;
          pdf_relevance: number;
          embedding: unknown;
        }> | {
          id: string;
          audience: string;
          problem: string;
          intent: string;
          urgency: string;
          pdf_relevance: number;
          embedding: unknown;
        } | null;
      }>;

      return rows.map((r) => {
        const sa = Array.isArray(r.signal_analysis) ? r.signal_analysis[0] : r.signal_analysis;
        return {
          id: r.id,
          title: r.title,
          content: r.content,
          url: r.url,
          source_id: r.source_id,
          source_type: r.sources?.type || "web",
          published_at: r.published_at,
          analysis: sa
            ? {
                id: sa.id,
                audience: sa.audience,
                problem: sa.problem,
                intent: sa.intent,
                urgency: sa.urgency,
                pdf_relevance: sa.pdf_relevance,
                embedding: parseVector(sa.embedding),
              }
            : null,
        };
      });
    },

    extract: async (signals) => {
      const inputs = signals.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        url: s.url,
      }));

      const job = await runExtractionJob({
        signals: inputs,
        router,
        tier: "cheap",
      });

      if (job.successes.length > 0) {
        const { error } = await supabase.from("signal_analysis").upsert(
          job.successes.map((s) => ({ signal_id: s.signalId, ...s.analysis, embedding: null })),
          { onConflict: "signal_id" },
        );
        if (error) {
          throw new Error(`Failed to save signal_analysis: ${error.message}`);
        }
      }

      return {
        analyzed: job.total,
        succeeded: job.succeeded,
        failed: job.failed,
      };
    },

    clusterAndScore: async (signals) => {
      // 1. Ensure embeddings exist
      const missingEmbeds = signals.filter(
        (s) => !s.analysis?.embedding || s.analysis.embedding.length !== EXPECTED_EMBEDDING_DIM,
      );

      if (missingEmbeds.length > 0) {
        const texts = missingEmbeds.map(
          (s) => [s.title || "", s.analysis?.problem || s.content || ""].filter(Boolean).join("\n\n").trim(),
        );

        const embedRes = await router.embed({ texts });
        for (let i = 0; i < missingEmbeds.length; i++) {
          const vec = embedRes.embeddings[i];
          const sig = missingEmbeds[i];
          if (vec && sig.analysis) {
            sig.analysis.embedding = vec;
            await supabase
              .from("signal_analysis")
              .update({ embedding: vec })
              .eq("signal_id", sig.id);
          }
        }
      }

      // 2. Prepare ClusterSignal objects
      const clusterInputs: ClusterSignal[] = signals
        .filter((s) => s.analysis?.embedding?.length === EXPECTED_EMBEDDING_DIM)
        .map((s) => ({
          id: s.id,
          sourceType: s.source_type,
          title: s.title,
          content: s.content,
          url: s.url,
          publishedAt: s.published_at,
          analysis: {
            audience: s.analysis!.audience,
            problem: s.analysis!.problem,
            intent: s.analysis!.intent,
            urgency: s.analysis!.urgency,
            pdf_relevance: s.analysis!.pdf_relevance,
          },
          embedding: s.analysis!.embedding!,
        }));

      if (clusterInputs.length === 0) {
        return [];
      }

      const clusters = await clusterSignals(clusterInputs, {
        similarityThreshold: 0.72,
        router,
      });

      return clusters.map((c) => ({
        id: c.id,
        name: c.name,
        clusterId: c.id,
        trend: c.trend,
        demandScore: c.scoring.factors.demand,
        confidence: c.scoring.confidence,
        pdfFitScore: Math.round(c.scoring.factors.pdfSuitability * 100),
        signals: signals.filter((s) => c.signals.some((cs) => cs.id === s.id)),
      }));
    },

    saveMarkets: async (markets) => {
      const savedList: Array<{ id: string; name: string }> = [];

      for (const m of markets) {
        const { data: marketRow, error } = await supabase
          .from("markets")
          .insert({
            name: m.name,
            description: `Audience problems evidenced by ${m.signals.length} market signals.`,
            trend: m.trend,
            demand_score: m.demandScore,
            pdf_fit_score: m.pdfFitScore,
            confidence: m.confidence,
          })
          .select("id, name")
          .single();

        if (error || !marketRow) {
          throw new Error(`Failed to insert market "${m.name}": ${error?.message}`);
        }

        savedList.push({ id: marketRow.id, name: marketRow.name });

        // Link market_signals
        if (m.signals.length > 0) {
          const links = m.signals.map((sig) => ({
            market_id: marketRow.id,
            signal_id: sig.id,
            relevance: 0.85,
          }));
          await supabase.from("market_signals").upsert(links, { onConflict: "market_id,signal_id" });
        }
      }

      return savedList;
    },

    saveEvidence: async (items) => {
      const evidenceDeps = createServerEvidenceDeps();
      return writeEvidence(items, evidenceDeps);
    },

    generateOpportunities: async (markets) => {
      const marketInputs: OpportunityMarketInput[] = markets.map((m) => ({
        id: m.id,
        name: m.name,
        demandScore: m.demandScore,
        confidence: m.confidence,
        pdfFitScore: m.pdfFitScore,
        signals: m.signals.map((s) => ({
          id: s.id,
          source_id: s.source_id,
          source_type: s.source_type,
          title: s.title,
          content: s.content,
          url: s.url,
          published_at: s.published_at,
          analysis: s.analysis ? {
            audience: s.analysis.audience,
            problem: s.analysis.problem,
            intent: s.analysis.intent,
            urgency: s.analysis.urgency,
            pdf_relevance: s.analysis.pdf_relevance,
          } : null,
        })),
      }));

      const res = await generate25Opportunities(marketInputs, {
        targetCount: 25,
        router,
        tier: "strong",
      });

      return res.opportunities.map((opp) => ({
        opportunity: {
          id: opp.id,
          marketId: opp.marketId,
          title: opp.title,
          targetAudience: opp.targetAudience,
          problem: opp.problem,
          solution: opp.solution,
          format: opp.format,
          opportunityScore: opp.opportunityScore,
          confidence: opp.confidence,
        },
        evidence: opp.evidence,
      }));
    },

    saveOpportunities: async (opportunities) => {
      const saved: Array<{ id: string; title: string }> = [];

      for (const opp of opportunities) {
        const { data, error } = await supabase
          .from("opportunities")
          .insert({
            id: opp.id,
            market_id: opp.marketId,
            title: opp.title,
            target_audience: opp.targetAudience,
            problem: opp.problem,
            solution: opp.solution,
            format: opp.format,
            opportunity_score: opp.opportunityScore,
            confidence: opp.confidence,
          })
          .select("id, title")
          .single();

        if (error || !data) {
          throw new Error(`Failed to save opportunity "${opp.title}": ${error?.message}`);
        }

        saved.push({ id: data.id, title: data.title });
      }

      return saved;
    },

    observeCompetition: async (signals) => {
      const observed: OrchestratorCompetitorItem[] = [];

      // Check signals for marketplace signals (etsy, gumroad, kdp) or web competitor products
      for (const sig of signals) {
        const isMarketplace =
          sig.source_type === "etsy" ||
          sig.source_type === "gumroad" ||
          sig.source_type === "kdp";

        const isWebProduct =
          sig.source_type === "web" &&
          sig.url &&
          /guide|handbook|manual|checklist|book|workbook|template|cheat sheet|troubleshooting/i.test(
            sig.title || "",
          );

        if ((isMarketplace || isWebProduct) && sig.url) {
          const platform =
            sig.source_type === "kdp"
              ? "amazon_kdp"
              : sig.source_type === "etsy"
              ? "etsy"
              : sig.source_type === "gumroad"
              ? "gumroad"
              : "web";

          const parsed = parseMarketplaceProduct(platform, {
            title: sig.title || undefined,
            link: sig.url || undefined,
            snippet: sig.content || undefined,
          });

          observed.push({
            platform,
            title: parsed.title,
            url: parsed.url,
            price: parsed.price,
            rating: parsed.rating,
            reviewCount: parsed.reviewCount,
            format: parsed.format,
            positioning: parsed.positioning,
            promises: parsed.promises,
            reviews: parsed.reviews,
          });
        }
      }

      return observed.slice(0, 10);
    },

    saveCompetitors: async (competitors) => {
      const saved: Array<{ id: string }> = [];
      for (const c of competitors) {
        const { data, error } = await supabase
          .from("competitors")
          .insert({
            market_id: c.market_id,
            platform: c.platform,
            title: c.title,
            url: c.url || null,
            price: c.price || null,
            rating: c.rating || null,
            review_count: c.review_count || null,
          })
          .select("id")
          .single();

        if (!error && data) {
          saved.push({ id: data.id });
        }
      }
      return saved;
    },

    fetchCompleteness: async (runId, query) => {
      return fetchRunCompleteness(supabase, query);
    },
  };
}
