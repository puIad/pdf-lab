// lib/export/fetcher.ts — Fetches and prepares full ReportExportData from database per PRD §46 & §55.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReportExportData,
  ExportOpportunity,
  ExportCompetitor,
  ExportProductGap,
  ExportEvidenceItem,
} from "./types.ts";
import { readAll } from "../db/read-all.ts";
import { fetchRunCompleteness, calculateCompleteness } from "../runs/completeness.ts";
import {
  marketCompletenessCounts,
  marketQcRules,
  NOT_OBSERVED,
  observeMarket,
  type ReportSignal,
} from "../report/observed.ts";
import { parsePrice } from "../sources/marketplace-helper.ts";
import { formatText } from "../opportunities/format.ts";
import {
  listingFormat,
  mineReviewsAndGaps,
  type CompetitorProduct,
} from "../competition/index.ts";

interface EvidenceRead {
  id: string;
  entity_type: string;
  entity_id: string;
  source_id: string | null;
  claim: string;
  excerpt: string | null;
  url: string | null;
  created_at: string;
  sources: { type?: string; name?: string } | null;
}

interface CompetitorRead {
  id: string;
  platform: string | null;
  title: string | null;
  url: string | null;
  price: string | null;
  rating: number | null;
  review_count: number | null;
}

export interface FetchReportOptions {
  marketId?: string;
  runId?: string;
  query?: string;
}

export async function fetchReportExportData(
  supabase: SupabaseClient,
  options: FetchReportOptions,
): Promise<ReportExportData> {
  const { marketId, runId, query: inputQuery } = options;

  let targetMarketId = marketId;
  let queryText = inputQuery || "";

  // 1. Resolve run if runId provided
  if (runId) {
    const { data: run } = await supabase
      .from("research_runs")
      .select("id, query")
      .eq("id", runId)
      .single();

    if (run) {
      queryText = queryText || run.query;
    }
  }

  // 2. Fetch market
  let marketQuery = supabase
    .from("markets")
    .select("id, run_id, name, description, trend, demand_score, competition_score, pdf_fit_score, confidence, created_at");

  if (targetMarketId) {
    marketQuery = marketQuery.eq("id", targetMarketId);
  } else if (runId) {
    // The run's strongest market leads its report (Part 6.7).
    marketQuery = marketQuery.eq("run_id", runId).order("demand_score", { ascending: false });
  } else if (queryText) {
    marketQuery = marketQuery.ilike("name", `%${queryText}%`).order("created_at", { ascending: false });
  } else {
    marketQuery = marketQuery.order("created_at", { ascending: false });
  }

  const { data: marketData, error: mErr } = await marketQuery.limit(1).maybeSingle();
  if (mErr || !marketData) {
    throw new Error(`Market not found: ${mErr?.message || "No market matches criteria"}`);
  }

  targetMarketId = marketData.id;
  queryText = queryText || marketData.name;

  // 3. Fetch linked signals & analysis for this market
  const marketSignals = await readAll<{ signals: Record<string, unknown> | null }>("market signals", () =>
    supabase
      .from("market_signals")
      .select(`
      signal_id, relevance,
      signals (
        id, title, content, url, published_at,
        sources ( type, name ),
        signal_analysis ( audience, problem, urgency, pdf_relevance )
      )
    `)
      .eq("market_id", targetMarketId)
      .order("signal_id"),
  );

  const rawSignals = marketSignals.flatMap((ms) => (ms.signals ? [ms.signals] : []));

  // 4. Opportunities: the whole run's when the market belongs to one, else this market's only.
  // Never another run's rows (Part 6.7).
  const scopedRunId = (marketData.run_id as string | null) ?? null;
  let oppQuery = supabase
    .from("opportunities")
    .select("id, market_id, title, target_audience, problem, solution, format, format_basis, price_range, opportunity_score, confidence, created_at");
  oppQuery = scopedRunId ? oppQuery.eq("run_id", scopedRunId) : oppQuery.eq("market_id", targetMarketId);
  // shortcut: the export lists the 25 best opportunities, so ask for 25 (ties broken by id), not every row.
  const { data: oppRows } = await oppQuery.order("opportunity_score", { ascending: false }).order("id").limit(25);

  const opportunitiesList = oppRows ?? [];
  const oppIds = opportunitiesList.map((o) => o.id);

  // 5. Fetch evidence for opportunities and market
  const entityIdsToCheck = [targetMarketId, ...oppIds];
  const evRows = await readAll<EvidenceRead>("evidence", () =>
    supabase
      .from("evidence")
      .select(`
      id, entity_type, entity_id, source_id, claim, excerpt, url, created_at,
      sources ( type, name )
    `)
      .in("entity_id", entityIdsToCheck)
      .order("id"),
  );

  const evidenceMap = new Map<string, ExportEvidenceItem[]>();
  for (const ev of evRows) {
    const sourceObj = ev.sources;
    const item: ExportEvidenceItem = {
      id: ev.id,
      claim: ev.claim,
      excerpt: ev.excerpt,
      url: ev.url,
      sourceName: sourceObj?.name || null,
      sourceType: sourceObj?.type || null,
      createdAt: ev.created_at,
    };
    const existing = evidenceMap.get(ev.entity_id) || [];
    existing.push(item);
    evidenceMap.set(ev.entity_id, existing);
  }

  // Map opportunities to ExportOpportunity
  const exportOpportunities: ExportOpportunity[] = opportunitiesList.map((opp) => {
    const oppEvidence = evidenceMap.get(opp.id) || [];
    // Only the opportunity's own rows: its market's evidence is not evidence for it (Part 6.14).
    const finalEvidence = oppEvidence;
    return {
      id: opp.id,
      marketId: opp.market_id,
      title: opp.title,
      targetAudience: opp.target_audience || NOT_OBSERVED,
      problem: opp.problem || NOT_OBSERVED,
      solution: opp.solution || NOT_OBSERVED,
      format: formatText(opp.format) ?? NOT_OBSERVED,
      formatBasis: opp.format ? ((opp.format_basis as string | null) ?? null) : null,
      priceRange: opp.price_range || NOT_OBSERVED,
      opportunityScore: Math.round(opp.opportunity_score ?? 0),
      confidence: opp.confidence,
      evidenceCount: finalEvidence.length,
      evidence: finalEvidence,
    };
  });

  // 6. Fetch competitors: the whole run's, like its opportunities, including listings that
  // overlap no market (`market_id` null); a legacy market only has its own.
  const compRows = await readAll<CompetitorRead>("competitors", () => {
    const compQuery = supabase.from("competitors").select("id, platform, title, url, price, rating, review_count");
    return (scopedRunId ? compQuery.eq("run_id", scopedRunId) : compQuery.eq("market_id", targetMarketId)).order("id");
  });

  const exportCompetitors: ExportCompetitor[] = compRows.map((comp) => ({
    platform: comp.platform || "web",
    title: comp.title || "Competitor Product",
    url: comp.url || null,
    price: comp.price || null,
    rating: comp.rating || null,
    reviewCount: comp.review_count || null,
  }));

  // 7. Calculate landscape and product gaps
  const competitorProducts: CompetitorProduct[] = compRows.map((comp) => {
    const { priceNumeric } = parsePrice(comp.price);
    return {
      id: comp.id,
      platform: comp.platform || "web",
      title: comp.title || "Untitled Product",
      url: comp.url,
      price: comp.price,
      priceNumeric,
      format: listingFormat(comp.title),
      rating: comp.rating,
      reviewCount: comp.review_count,
      positioning: null,
      promises: [],
      reviews: [],
    };
  });

  const { productGaps } = mineReviewsAndGaps(
    competitorProducts,
    rawSignals.map((s) => ({
      title: (s.title as string | null) || null,
      content: (s.content as string | null) || null,
      url: (s.url as string | null) || null,
      source_type: ((s.sources as { type?: string })?.type as string | null) || null,
    })),
  );

  const exportProductGaps: ExportProductGap[] = productGaps.map((g) => {
    const firstExcerpt = g.reviewExcerpts && g.reviewExcerpts.length > 0 ? g.reviewExcerpts[0] : null;
    return {
      id: g.id,
      title: g.title,
      category: g.category,
      gap: g.title || g.summary,
      evidence: firstExcerpt?.quote || g.summary,
      opportunityTranslation: g.opportunityTranslation,
      sourceType: firstExcerpt?.source || null,
      sourceUrl: firstExcerpt?.url || null,
    };
  });

  // Customer quotes
  const customerQuotes: Array<{ quote: string; url?: string | null }> = [];
  for (const s of rawSignals) {
    if (s.content && typeof s.content === "string") {
      customerQuotes.push({
        quote: s.content.slice(0, 180),
        url: (s.url as string | null) ?? null,
      });
    }
  }

  // 8. Completeness: the run's own counts when the market belongs to a run, else this market's
  // stored rows. No floors: a thin market reads as thin (Part 6.14).
  const evidenceForQc = evRows.map((e) => ({
    entity_type: e.entity_type as string,
    entity_id: e.entity_id as string,
    source_id: e.source_id as string | null,
    url: e.url as string | null,
    excerpt: e.excerpt as string | null,
  }));
  const qcRules = marketQcRules({
    market: {
      trend: marketData.trend ?? null,
      demand_score: marketData.demand_score ?? null,
      competition_score: marketData.competition_score ?? null,
    },
    signals: rawSignals as ReportSignal[],
    competitorCount: compRows.length,
    opportunityIds: oppIds,
    evidence: evidenceForQc,
  });
  const marketCounts = marketCompletenessCounts({
    observations: observeMarket(rawSignals as ReportSignal[]),
    opportunityIds: oppIds,
    evidence: evidenceForQc,
    rules: qcRules,
  });
  const runComp = scopedRunId ? await fetchRunCompleteness(supabase, scopedRunId).catch(() => null) : null;
  const completeness = runComp ?? calculateCompleteness(marketCounts);


  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    query: queryText,
    market: {
      id: marketData.id,
      name: marketData.name,
      description: marketData.description,
      trend: marketData.trend || "unknown",
      demandScore: marketData.demand_score ?? null,
      competitionScore: marketData.competition_score ?? null,
      pdfFitScore: marketData.pdf_fit_score ?? null,
      confidence: marketData.confidence ?? null,
      createdAt: marketData.created_at,
    },
    completeness,
    qcRules,
    competitors: exportCompetitors,
    productGaps: exportProductGaps,
    customerQuotes,
    opportunities: exportOpportunities,
  };
}
