// app/api/research/route.ts — Phase 3 Part 3.4 natural-language research + modes (PRD §26–§28).
// POST { prompt, mode?, user_id? } → planner turns the prompt into a structured query, the mode
// picks the pipeline depth, and the run is persisted with its mode, rule-set version and plan.
// `pdf-lab <niche>` (or mode "deep") runs the full 10-state pipeline and needs the internal key.
// The other modes are counted as one search against the caller's plan (Part 5.1).

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { generateMarketOverview } from "@/lib/search";
import { fetchMarketsData } from "@/lib/markets/fetcher";
import { detectTopicTrend, type SignalRecord } from "@/lib/trends";
import { executeResearchRun } from "@/lib/runs/orchestrator";
import { createServerOrchestratorDeps } from "@/lib/runs/service-deps";
import { routerForUser } from "@/lib/keys/server";
import { EXTRACTION_PROMPT_VERSION } from "@/lib/ai/index";
import { OPPORTUNITY_PROMPT_VERSION } from "@/lib/opportunities";
import { isDemandOnly } from "@/lib/sources/demand-only";
import { enforceQuota, refund } from "@/lib/quotas/guard";
import {
  RESEARCH_MODES,
  buildValidationReport,
  buildVerdict,
  filterMarkets,
  planResearch,
  searchTextOf,
  seedOf,
  tokenize,
  type ResearchMode,
} from "@/lib/planner";

export const dynamic = "force-dynamic";

const MAX_PROMPT_LENGTH = 500;
const MAX_MARKETS = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResearchBody {
  prompt?: unknown;
  mode?: unknown;
  user_id?: unknown;
}

interface MonitorSignalRow {
  id: string;
  title: string | null;
  content: string | null;
  published_at: string | null;
  external_id: string | null;
  engagement: Record<string, unknown> | null;
  sources: { type?: string } | { type?: string }[] | null;
  signal_analysis: { intent?: string | null; urgency?: string | null } | { intent?: string | null; urgency?: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function POST(req: Request) {
  let body: ResearchBody;
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object") throw new Error("not an object");
    body = raw as ResearchBody;
  } catch {
    return NextResponse.json({ error: "request body must be a JSON object" }, { status: 400 });
  }

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt must be a non-empty string" }, { status: 400 });
  }
  if (body.prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: `prompt must be at most ${MAX_PROMPT_LENGTH} characters` }, { status: 400 });
  }
  if (body.mode !== undefined && !RESEARCH_MODES.includes(body.mode as ResearchMode)) {
    return NextResponse.json({ error: `mode must be one of: ${RESEARCH_MODES.join(", ")}` }, { status: 400 });
  }
  if (body.user_id !== undefined && (typeof body.user_id !== "string" || !UUID_RE.test(body.user_id))) {
    return NextResponse.json({ error: "user_id must be a UUID" }, { status: 400 });
  }

  const plan = planResearch(body.prompt, body.mode as ResearchMode | undefined);
  const text = searchTextOf(plan.query);

  // Part 5.1. A Deep run in one request calls the model for minutes and does not fit a function
  // (DEC-001), so it stays on the server key; signed-in users run Deep through /deep. Every other
  // mode reads stored rows and is counted as one search.
  const guard = await enforceQuota(req.headers, plan.mode === "deep" ? "internal" : "search");
  if (guard.denied) {
    return plan.mode === "deep"
      ? NextResponse.json({ error: "A one-request Deep run needs the internal API key. Use the Deep research page instead.", plan }, { status: 401 })
      : guard.denied;
  }
  // The run belongs to the signed-in caller. Only the server key may name another owner.
  const userId = guard.caller.userId ?? (guard.caller.plan === "internal" ? ((body.user_id as string | undefined) ?? null) : null);

  if (plan.mode === "deep") {
    if (!text) {
      return NextResponse.json({ error: "Deep research needs a niche, e.g. `pdf-lab pc troubleshooting`", plan }, { status: 400 });
    }
    const result = await executeResearchRun(
      {
        query: text,
        // The planner's search text drops format words and "for …" spans; ideas are stored under the typed seed.
        seed: seedOf(body.prompt),
        mode: "deep",
        limit: 25,
        userId,
        promptVersion: plan.promptVersion,
        plan: {
          ...plan,
          pipelinePromptVersions: { extraction: EXTRACTION_PROMPT_VERSION, opportunity: OPPORTUNITY_PROMPT_VERSION },
        },
      },
      createServerOrchestratorDeps({ userRouter: await routerForUser(userId) }),
    );
    return NextResponse.json(
      { runId: result.runId, plan, result: { mode: "deep", run: result } },
      { status: result.status === "completed" ? 200 : 502 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const startedAt = new Date().toISOString();

  try {
    let result: Record<string, unknown>;

    switch (plan.mode) {
      case "explore": {
        const [overview, { markets }] = await Promise.all([
          text ? generateMarketOverview(text, supabase, { mode: "explore", persistRun: false }) : null,
          fetchMarketsData(supabase),
        ]);
        result = { mode: "explore", overview, markets: filterMarkets(markets, plan.query).slice(0, MAX_MARKETS) };
        break;
      }
      case "hunt": {
        const { markets } = await fetchMarketsData(supabase);
        const matches = filterMarkets(markets, plan.query);
        result = { mode: "hunt", totalMatches: matches.length, markets: matches.slice(0, MAX_MARKETS) };
        break;
      }
      case "validate": {
        const concept = plan.query.concept ?? plan.query.raw;
        const overview = await generateMarketOverview(concept, supabase, { mode: "validate", persistRun: false });
        result = { mode: "validate", report: buildValidationReport(concept, overview), verdict: buildVerdict(overview) };
        break;
      }
      case "monitor": {
        if (!text) {
          await refund(guard);
          return NextResponse.json({ error: "Monitor needs a niche, e.g. `monitor: pc troubleshooting`", plan }, { status: 400 });
        }
        const { data, error } = await supabase
          .from("signals")
          .select("id, title, content, published_at, external_id, engagement, sources ( type ), signal_analysis ( intent, urgency )")
          .not("published_at", "is", null) // QC Rule 2: collection time is not temporal evidence
          .order("published_at", { ascending: false })
          .limit(1000);
        if (error) throw new Error(error.message);

        const tokens = tokenize(text).map((t) => t.replace(/s$/, ""));
        const signals: SignalRecord[] = ((data ?? []) as MonitorSignalRow[])
          .filter((s) => {
            if (isDemandOnly({ source_type: one(s.sources)?.type, external_id: s.external_id })) return false; // not discussions
            const hay = `${s.title ?? ""} ${s.content ?? ""}`.toLowerCase();
            return tokens.some((t) => hay.includes(t));
          })
          .map((s) => ({
            id: s.id,
            sourceType: one(s.sources)?.type ?? "unknown",
            title: s.title,
            content: s.content,
            publishedAt: s.published_at as string,
            engagement: s.engagement as SignalRecord["engagement"],
            intent: one(s.signal_analysis)?.intent ?? null,
            urgency: one(s.signal_analysis)?.urgency ?? null,
          }));

        result = {
          mode: "monitor",
          datedSignals: signals.length,
          trend: detectTopicTrend({ marketId: `query:${text}`, topicName: text, signals }),
          note: "One-off snapshot. Scheduled re-runs + change detection arrive with the watchlist (Phase 4.1–4.2).",
        };
        break;
      }
    }

    const { data: run, error: runErr } = await supabase
      .from("research_runs")
      .insert({
        user_id: userId,
        query: plan.query.raw,
        mode: plan.mode,
        status: "completed",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        prompt_version: plan.promptVersion,
        plan,
      })
      .select("id")
      .single();
    if (runErr) throw new Error(`failed to persist research run: ${runErr.message}`);

    return NextResponse.json({ runId: run.id, plan, result, quota: guard.quota });
  } catch (err) {
    await refund(guard); // the run failed: it does not count
    return NextResponse.json(
      { error: `Research failed: ${err instanceof Error ? err.message : String(err)}`, plan },
      { status: 500 },
    );
  }
}
