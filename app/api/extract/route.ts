import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getRouter, runExtractionJob } from "@/lib/ai/index";
import type { ExtractionInput } from "@/lib/ai/index";
import { EXTRACTION_PROMPT_VERSION } from "@/lib/ai/index";
import { buildSearchFilter } from "@/lib/db/search";
import { isDemandOnly } from "@/lib/sources/demand-only";

// POST /api/extract — Phase 1 Part 1.3.
// Turns STORED signals into validated `signal_analysis` rows (one per
// signal; re-runs UPDATE via onConflict). Extraction NEVER invents signals:
// every analyzed id must already exist in `signals` (unknown ids → 400,
// failures → reported with no row written).
//
// Body: { signal_ids?: string[], query?: string, limit?: number,
//         provider?: string, only_missing?: boolean (default true) }
//  - signal_ids: analyze exactly these stored signals.
//  - otherwise: oldest signals with NO analysis row yet (ilike `query` when
//    given), up to `limit` (default 50, max 100 — chunk large runs; free
//    shared pools rate-limit and serverless timeouts apply).
// Server-only (service-role DB writes). No auth in MVP; Phase 5 gates this.

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const EMPTY_COST = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  providers: [] as string[],
  models: [] as string[],
};

interface ExtractBody {
  signal_ids?: unknown;
  query?: unknown;
  limit?: unknown;
  provider?: unknown;
  only_missing?: unknown;
}

interface SignalRow {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
}

export async function POST(req: Request) {
  // Auth guard (pre-Phase 5 lightweight secret key)
  const authHeader = req.headers.get("x-api-key");
  if (authHeader !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ExtractBody;
  try {
    const rawBody = await req.json();
    if (!rawBody || typeof rawBody !== "object") throw new Error("Invalid body");
    body = rawBody as ExtractBody;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON object" }, { status: 400 });
  }

  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    if (typeof body.limit !== "number" || body.limit <= 0) {
      return NextResponse.json({ error: "limit must be a positive number" }, { status: 400 });
    }
    limit = Math.min(MAX_LIMIT, Math.floor(body.limit));
  }
  if (body.provider !== undefined && typeof body.provider !== "string") {
    return NextResponse.json({ error: "provider must be a string" }, { status: 400 });
  }
  const onlyMissing = body.only_missing === undefined ? true : body.only_missing === true;

  let signalIds: string[] | undefined;
  if (body.signal_ids !== undefined) {
    if (!Array.isArray(body.signal_ids) || body.signal_ids.some((s) => typeof s !== "string")) {
      return NextResponse.json({ error: "signal_ids must be an array of strings" }, { status: 400 });
    }
    signalIds = [...new Set(body.signal_ids as string[])].slice(0, MAX_LIMIT);
    if (signalIds.length === 0) {
      return NextResponse.json({ error: "signal_ids must not be empty" }, { status: 400 });
    }
  }

  const supabase = createServiceSupabaseClient();

  // 1. Select stored signals — the ONLY source of analysis input.
  let signals: SignalRow[];
  if (signalIds) {
    const { data, error } = await supabase
      .from("signals")
      .select("id,title,content,url")
      .in("id", signalIds);
    if (error) return NextResponse.json({ error: `signals lookup failed: ${error.message}` }, { status: 500 });
    const found = new Set(((data ?? []) as SignalRow[]).map((r) => r.id));
    const unknown = signalIds.filter((id) => !found.has(id));
    if (unknown.length > 0) {
      // Never invent: unknown ids are rejected, not fabricated.
      return NextResponse.json(
        { error: `unknown signal ids (not in signals table): ${unknown.slice(0, 10).join(", ")}` },
        { status: 400 },
      );
    }
    signals = (data ?? []) as SignalRow[];
  } else {
    let query = supabase
      .from("signals")
      .select("id,title,content,url,collected_at,external_id,sources(type),signal_analysis!left(signal_id)")
      .order("collected_at", { ascending: true })
      .limit(limit * 3); // over-fetch: missing-analysis filter applies below
    if (typeof body.query === "string" && body.query.trim().length > 0) {
      const filter = buildSearchFilter(body.query);
      if (filter) {
        query = query.or(filter);
      }
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: `signals lookup failed: ${error.message}` }, { status: 500 });
    const rows = ((data ?? []) as Array<
      SignalRow & { signal_analysis: unknown; external_id: string | null; sources: { type?: string } | null }
    >).filter((r) => !isDemandOnly({ source_type: r.sources?.type, external_id: r.external_id })); // demand rows are never extracted
    const hasNoAnalysis = (sa: unknown) => sa == null || (Array.isArray(sa) && sa.length === 0);
    const missing = onlyMissing ? rows.filter((r) => hasNoAnalysis(r.signal_analysis)) : rows;
    signals = missing.slice(0, limit).map(({ id, title, content, url }) => ({ id, title, content, url }));
  }

  if (signals.length === 0) {
    return NextResponse.json({
      promptVersion: EXTRACTION_PROMPT_VERSION,
      analyzed: 0,
      upserted: 0,
      failed: 0,
      message: "no signals selected (all analyzed already, or no match)",
      failures: [],
      cost: EMPTY_COST,
      costLog: [],
    });
  }

  // 2. Extract via AIRouter (cheap tier; provider override optional).
  const inputs: ExtractionInput[] = signals.map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    url: s.url,
  }));
  let job;
  try {
    job = await runExtractionJob({
      signals: inputs,
      router: getRouter(),
      tier: "cheap",
      providerName: body.provider as string | undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `extraction job failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // 3. Upsert one analysis row per SUCCEEDED signal (failures: no row, reported).
  if (job.successes.length > 0) {
    const { error } = await supabase.from("signal_analysis").upsert(
      job.successes.map((s) => ({ signal_id: s.signalId, ...s.analysis, embedding: null })),
      { onConflict: "signal_id" },
    );
    if (error) return NextResponse.json({ error: `analysis upsert failed: ${error.message}` }, { status: 500 });
  }

  // 4. Token/call cost log: structured server log (Phase 5 ledger) + response.
  console.log(
    JSON.stringify({
      event: "extract",
      promptVersion: job.promptVersion,
      tier: job.tier,
      total: job.total,
      succeeded: job.succeeded,
      failed: job.failed,
      cost: job.cost,
    }),
  );

  return NextResponse.json({
    promptVersion: job.promptVersion,
    tier: job.tier,
    analyzed: job.total,
    upserted: job.successes.length,
    failed: job.failed,
    failures: job.failures,
    cost: job.cost,
    costLog: job.costLog,
  });
}
