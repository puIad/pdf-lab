// app/api/opportunities/generate/route.ts — Phase 2 Part 2.1 API.
// Generates exactly 25 diversified, evidence-backed opportunities from stored markets and signals.
// Persists opportunities to `opportunities` table and evidence to `evidence` table (QC Rule 1).

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getRouter } from "@/lib/ai/index";
import { generate25Opportunities } from "@/lib/opportunities/index";
import type { OpportunityMarketInput, OpportunitySignalInput } from "@/lib/opportunities/index";
import { writeEvidence } from "@/lib/evidence/writer";
import { createServerEvidenceDeps } from "@/lib/evidence/service-deps";

export const dynamic = "force-dynamic";

interface GenerateBody {
  market_ids?: unknown;
  query?: unknown;
  limit?: unknown;
}

export async function POST(req: Request) {
  // Auth guard (pre-Phase 5 lightweight secret key)
  const authHeader = req.headers.get("x-api-key");
  if (authHeader !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: GenerateBody = {};
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    // Empty body is acceptable
  }

  let limit = 25;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || body.limit <= 0) {
      return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
    }
    limit = Math.min(50, Math.floor(body.limit));
  }

  const supabase = createServiceSupabaseClient();
  const router = getRouter();

  // 1. Fetch relevant markets
  let marketQuery = supabase
    .from("markets")
    .select(`
      id, name, description, trend, demand_score, pdf_fit_score, confidence,
      market_signals (
        signal_id,
        signals (
          id, source_id, title, content, url, published_at,
          signal_analysis (
            audience, problem, intent, urgency, pdf_relevance
          )
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (Array.isArray(body.market_ids) && body.market_ids.length > 0) {
    marketQuery = marketQuery.in("id", body.market_ids as string[]);
  } else if (typeof body.query === "string" && body.query.trim().length > 0) {
    marketQuery = marketQuery.ilike("name", `%${body.query.trim()}%`);
  }

  const { data: marketRows, error: mErr } = await marketQuery.limit(10);
  if (mErr) {
    return NextResponse.json({ error: `Failed to fetch markets: ${mErr.message}` }, { status: 500 });
  }

  if (!marketRows || marketRows.length === 0) {
    return NextResponse.json(
      { error: "No market candidates found to generate opportunities from. Run research run first." },
      { status: 404 },
    );
  }

  // 2. Map DB records to OpportunityMarketInput
  const marketsForGeneration: OpportunityMarketInput[] = marketRows.map((m) => {
    const rawSignals: OpportunitySignalInput[] = [];
    if (Array.isArray(m.market_signals)) {
      for (const ms of m.market_signals) {
        const s = (ms as unknown as { signals: Record<string, unknown> }).signals;
        if (s && typeof s === "object") {
          const sa = Array.isArray(s.signal_analysis) ? s.signal_analysis[0] : s.signal_analysis;
          rawSignals.push({
            id: s.id as string,
            source_id: s.source_id as string | null,
            title: (s.title as string | null) ?? null,
            content: (s.content as string | null) ?? null,
            url: (s.url as string | null) ?? null,
            published_at: (s.published_at as string | null) ?? null,
            analysis: sa ? {
              audience: sa.audience,
              problem: sa.problem,
              intent: sa.intent,
              urgency: sa.urgency,
              pdf_relevance: sa.pdf_relevance,
            } : null,
          });
        }
      }
    }

    return {
      id: m.id,
      name: m.name,
      description: m.description,
      trend: m.trend,
      demandScore: m.demand_score || 50,
      confidence: m.confidence || 0.5,
      pdfFitScore: m.pdf_fit_score || 75,
      signals: rawSignals,
    };
  });

  // 3. Generate diversified opportunities
  const generationResult = await generate25Opportunities(marketsForGeneration, {
    targetCount: limit,
    router,
    tier: "strong",
  });

  // 4. Persist opportunities to `opportunities` table
  const oppRowsToInsert = generationResult.opportunities.map((opp) => ({
    id: opp.id,
    market_id: opp.marketId,
    title: opp.title,
    target_audience: opp.targetAudience,
    problem: opp.problem,
    solution: opp.solution,
    format: opp.format,
    price_range: opp.priceRange,
    opportunity_score: opp.opportunityScore,
    confidence: opp.confidence,
  }));

  const { error: oppInsertErr } = await supabase
    .from("opportunities")
    .upsert(oppRowsToInsert, { onConflict: "id" });

  if (oppInsertErr) {
    return NextResponse.json(
      { error: `Failed to persist opportunities: ${oppInsertErr.message}` },
      { status: 500 },
    );
  }

  // 5. Persist evidence rows to `evidence` table (QC Rule 1)
  const allEvidence = generationResult.opportunities.flatMap((opp) => opp.evidence);
  if (allEvidence.length > 0) {
    const evidenceDeps = createServerEvidenceDeps();
    await writeEvidence(allEvidence, evidenceDeps);
  }

  return NextResponse.json({
    count: generationResult.opportunities.length,
    promptVersion: generationResult.promptVersion,
    diversification: generationResult.diversification,
    opportunities: generationResult.opportunities,
  });
}
