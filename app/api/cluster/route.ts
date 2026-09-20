// app/api/cluster/route.ts — Phase 1 Part 1.4.
// Problem clustering (pgvector) + market scoring & persistence.
// Turns extracted signals into pgvector embeddings, clusters them by cosine
// similarity into PRD §15 problem families, scores them with evidence-backed
// metrics (Demand × Momentum × Frequency × Intent × PDFfit ÷ Density),
// and persists `markets` and `market_signals` rows.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getRouter } from "@/lib/ai/index";
import { clusterSignals } from "@/lib/cluster/index";
import type { ClusterSignal } from "@/lib/cluster/index";
import { cosineSimilarity } from "@/lib/cluster/similarity";
import { summarizeCostLog } from "@/lib/ai/types";
import type { CostLogEntry } from "@/lib/ai/types";
import { buildSearchFilter } from "@/lib/db/search";

export const dynamic = "force-dynamic";

const EXPECTED_EMBEDDING_DIM = 1536;

interface ClusterBody {
  signal_ids?: unknown;
  query?: unknown;
  similarity_threshold?: unknown;
}

interface RawSignalWithAnalysis {
  id: string;
  source_id: string;
  external_id: string | null;
  url: string | null;
  title: string | null;
  content: string | null;
  published_at: string | null;
  engagement: Record<string, unknown> | null;
  sources?: { type: string } | null;
  signal_analysis?: {
    id: string;
    audience: string | null;
    problem: string | null;
    intent: string | null;
    urgency: string | null;
    pdf_relevance: number | null;
    embedding: unknown;
  } | null;
}

function parseVector(v: unknown): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    return v.map(Number);
  }
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

export async function POST(req: Request) {
  let body: ClusterBody = {};
  try {
    body = (await req.json()) as ClusterBody;
  } catch {
    // Empty body is acceptable: clusters all analyzed signals
  }

  let similarityThreshold = 0.72;
  if (body.similarity_threshold !== undefined) {
    if (typeof body.similarity_threshold !== "number" || body.similarity_threshold <= 0 || body.similarity_threshold >= 1) {
      return NextResponse.json(
        { error: "similarity_threshold must be a float between 0 and 1" },
        { status: 400 },
      );
    }
    similarityThreshold = body.similarity_threshold;
  }

  const supabase = createServiceSupabaseClient();
  const router = getRouter();
  const costEntries: CostLogEntry[] = [];

  // 1. Fetch signals that have a valid signal_analysis row
  let query = supabase
    .from("signals")
    .select(`
      id, source_id, external_id, url, title, content, published_at, engagement,
      sources ( type ),
      signal_analysis!inner (
        id, audience, problem, intent, urgency, pdf_relevance, embedding
      )
    `);

  if (Array.isArray(body.signal_ids) && body.signal_ids.length > 0) {
    query = query.in("id", body.signal_ids as string[]);
  } else if (typeof body.query === "string" && body.query.trim().length > 0) {
    const filter = buildSearchFilter(body.query);
    if (filter) {
      query = query.or(filter);
    }
  }

  const { data: rawRows, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: `signals query failed: ${fetchErr.message}` }, { status: 500 });
  }

  const rows = (rawRows || []) as unknown as RawSignalWithAnalysis[];
  if (rows.length === 0) {
    return NextResponse.json({
      clustersCount: 0,
      signalsCount: 0,
      clusters: [],
      message: "no analyzed signals found to cluster",
    });
  }

  // 2. Identify signals missing embeddings and generate them via embed-tier model
  const missingEmbeddingSignals: Array<{ signalId: string; analysisId: string; text: string }> = [];
  for (const row of rows) {
    const existingVec = parseVector(row.signal_analysis?.embedding);
    if (!existingVec || existingVec.length !== EXPECTED_EMBEDDING_DIM) {
      const text = [row.title || "", row.signal_analysis?.problem || row.content || ""]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (text) {
        missingEmbeddingSignals.push({
          signalId: row.id,
          analysisId: row.signal_analysis!.id,
          text,
        });
      }
    }
  }

  if (missingEmbeddingSignals.length > 0) {
    const BATCH_SIZE = 20;
    for (let i = 0; i < missingEmbeddingSignals.length; i += BATCH_SIZE) {
      const chunk = missingEmbeddingSignals.slice(i, i + BATCH_SIZE);
      const texts = chunk.map((c) => c.text);
      const t0 = Date.now();
      const embedRes = await router.embed({ texts });
      const latencyMs = Date.now() - t0;

      costEntries.push(
        router.costEntry({
          tier: "embed",
          provider: embedRes.provider,
          model: embedRes.model,
          usage: embedRes.usage,
          latencyMs,
        }),
      );

      // Verify dimensions
      for (let j = 0; j < chunk.length; j++) {
        const vec = embedRes.embeddings[j];
        if (!vec || vec.length !== EXPECTED_EMBEDDING_DIM) {
          return NextResponse.json(
            {
              error: `embedding dimension mismatch: expected ${EXPECTED_EMBEDDING_DIM}, got ${vec?.length ?? 0}`,
            },
            { status: 502 },
          );
        }

        // Save embedding into signal_analysis
        const { error: updateErr } = await supabase
          .from("signal_analysis")
          .update({ embedding: vec })
          .eq("id", chunk[j].analysisId);

        if (updateErr) {
          return NextResponse.json(
            { error: `failed to save embedding: ${updateErr.message}` },
            { status: 500 },
          );
        }

        // Update local memory row
        const targetRow = rows.find((r) => r.id === chunk[j].signalId);
        if (targetRow && targetRow.signal_analysis) {
          targetRow.signal_analysis.embedding = vec;
        }
      }
    }
  }

  // 3. Prepare ClusterSignal objects
  const clusterInputSignals: ClusterSignal[] = [];
  for (const row of rows) {
    const vec = parseVector(row.signal_analysis?.embedding);
    if (vec && vec.length === EXPECTED_EMBEDDING_DIM && row.signal_analysis) {
      clusterInputSignals.push({
        id: row.id,
        sourceType: row.sources?.type || "web",
        title: row.title,
        content: row.content,
        url: row.url,
        publishedAt: row.published_at,
        engagement: row.engagement,
        analysis: {
          audience: row.signal_analysis.audience,
          problem: row.signal_analysis.problem,
          intent: row.signal_analysis.intent,
          urgency: row.signal_analysis.urgency,
          pdf_relevance: row.signal_analysis.pdf_relevance,
        },
        embedding: vec,
      });
    }
  }

  // 4. Cluster signals by cosine similarity
  const clusters = await clusterSignals(clusterInputSignals, {
    similarityThreshold,
    router,
  });

  // 5. Persist markets and market_signals in DB
  const savedMarkets: Array<{ id: string; name: string; clusterId: string }> = [];

  for (const cluster of clusters) {
    // Insert into markets
    const { data: marketRow, error: marketErr } = await supabase
      .from("markets")
      .insert({
        name: cluster.name,
        description: `Audience: ${cluster.audience}. Evidenced by ${cluster.frequency} signals. Primary problem: ${cluster.language[0] || cluster.name}`,
        trend: cluster.trend,
        demand_score: cluster.scoring.factors.demand,
        competition_score: cluster.scoring.factors.competitiveDensity,
        pdf_fit_score: Math.round(cluster.scoring.factors.pdfSuitability * 100),
        confidence: cluster.scoring.confidence,
      })
      .select("id, name")
      .single();

    if (marketErr) {
      return NextResponse.json(
        { error: `failed to insert market: ${marketErr.message}` },
        { status: 500 },
      );
    }

    savedMarkets.push({ id: marketRow.id, name: marketRow.name, clusterId: cluster.id });

    // Insert market_signals
    const marketSignalsData = cluster.signals.map((sig) => ({
      market_id: marketRow.id,
      signal_id: sig.id,
      relevance: Math.max(0, Math.min(1, Math.round(cosineSimilarity(sig.embedding, cluster.centroid) * 100) / 100)),
    }));

    const { error: msErr } = await supabase
      .from("market_signals")
      .upsert(marketSignalsData, { onConflict: "market_id,signal_id" });

    if (msErr) {
      return NextResponse.json(
        { error: `failed to link market_signals: ${msErr.message}` },
        { status: 500 },
      );
    }
  }

  const cost = summarizeCostLog(costEntries);

  console.log(
    JSON.stringify({
      event: "cluster",
      totalSignals: clusterInputSignals.length,
      clustersCount: clusters.length,
      similarityThreshold,
      savedMarkets: savedMarkets.length,
      cost,
    }),
  );

  return NextResponse.json({
    clustersCount: clusters.length,
    signalsCount: clusterInputSignals.length,
    similarityThreshold,
    markets: savedMarkets,
    clusters: clusters.map((c) => ({
      id: c.id,
      name: c.name,
      frequency: c.frequency,
      growth: c.growth,
      audience: c.audience,
      urgency: c.urgency,
      trend: c.trend,
      language: c.language,
      relatedProducts: c.relatedProducts,
      scoring: c.scoring,
      signalCount: c.signals.length,
    })),
    cost,
  });
}
