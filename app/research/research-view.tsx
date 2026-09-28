// app/research/research-view.tsx — Client console for NL research + modes (PRD §26–§28).
// The plan is computed live as you type (same deterministic planner the API uses), so the
// structured query and pipeline depth are visible before anything runs.

"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Crosshair,
  CornerDownLeft,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Quote,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Telescope,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  planResearch,
  RESEARCH_MODES,
  VALIDATION_BLOCKS,
  type MarketMatch,
  type ResearchMode,
  type ResearchPlan,
  type ValidationReport,
} from "@/lib/planner";
import type { EvidenceCitation, MarketOverview } from "@/lib/search/types";
import type { TopicTrendAnalysis } from "@/lib/trends/types";
import type { RunSummary } from "@/lib/runs/types";

export interface RecentRun {
  id: string;
  query: string;
  mode: string;
  status: string;
  started_at: string;
  prompt_version: string | null;
}

type ResearchResult =
  | { mode: "explore"; overview: MarketOverview | null; markets: MarketMatch[] }
  | { mode: "hunt"; totalMatches: number; markets: MarketMatch[] }
  | { mode: "validate"; report: ValidationReport }
  | { mode: "monitor"; datedSignals: number; trend: TopicTrendAnalysis; note: string }
  | { mode: "deep"; run: RunSummary };

interface ResearchResponse {
  runId?: string;
  plan?: ResearchPlan;
  result?: ResearchResult;
  error?: string;
}

const MODE_META: Record<ResearchMode, { label: string; hint: string; icon: React.ElementType }> = {
  explore: { label: "Explore", hint: "Broad scan of what is stored", icon: Telescope },
  validate: { label: "Validate", hint: "Test your exact concept", icon: ShieldCheck },
  hunt: { label: "Hunt", hint: "Filter for openings", icon: Crosshair },
  deep: { label: "Deep", hint: "Full pdf-lab pipeline", icon: Sparkles },
  monitor: { label: "Monitor", hint: "Multi-window trend check", icon: Activity },
};

const EXAMPLES = [
  "PDF markets for busy parents",
  "high intent + low competition",
  "problems asking for templates",
  "Would people buy a Notion template for freelancers?",
  "monitor: pc troubleshooting",
  "pdf-lab pc troubleshooting",
];

const SOURCE_LABEL: Record<ResearchPlan["modeSource"], string> = {
  explicit: "chosen",
  signature: "pdf-lab signature",
  inferred: "inferred from wording",
};

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const CITE_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground";

/** Internal rows (opportunity/market ids) link to their report page; external rows to their source. */
function internalHref(c: EvidenceCitation): string | null {
  if (!c.id) return null;
  if (c.source === "opportunity") return `/opportunities/${c.id}`;
  if (c.source === "market") return `/markets/${c.id}`;
  return null;
}

function Citations({ items }: { items: EvidenceCitation[] }) {
  const linked = items.filter((c) => c.url || internalHref(c));
  if (linked.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1.5 align-middle">
      {linked.slice(0, 3).map((c, i) => {
        const internal = internalHref(c);
        return internal ? (
          <Link key={`${internal}-${i}`} href={internal} className={CITE_CLASS}>
            {c.source}
            <ArrowRight className="size-2.5" />
          </Link>
        ) : (
          <a
            key={`${c.url}-${i}`}
            href={c.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className={CITE_CLASS}
          >
            {c.source || hostOf(c.url) || "source"}
            <ExternalLink className="size-2.5" />
          </a>
        );
      })}
    </span>
  );
}

function Chip({ label, value, active = true }: { label: string; value: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
        active ? "border-foreground/20 bg-background text-foreground" : "border-dashed border-border text-muted-foreground/60"
      }`}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function PlanPanel({ plan }: { plan: ResearchPlan }) {
  const q = plan.query;
  const Icon = MODE_META[plan.mode].icon;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-semibold text-background">
          <Icon className="size-3.5" />
          {MODE_META[plan.mode].label}
        </span>
        <span className="text-xs text-muted-foreground">{SOURCE_LABEL[plan.modeSource]}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">{plan.promptVersion}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {q.concept ? (
          <Chip label="concept" value={q.concept} />
        ) : (
          <Chip label="niche" value={q.niche || "any"} active={Boolean(q.niche)} />
        )}
        <Chip label="audience" value={q.audience ?? "any"} active={Boolean(q.audience)} />
        <Chip label="intent" value={q.intent} active={q.intent !== "any"} />
        <Chip label="competition" value={q.competition} active={q.competition !== "any"} />
        <Chip label="format" value={q.formats.length ? q.formats.join(", ") : "any"} active={q.formats.length > 0} />
        <Chip
          label="trend"
          value={q.trend === "any" ? "any" : q.horizonDays ? `${q.trend} · next ${q.horizonDays}d` : q.trend}
          active={q.trend !== "any"}
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {plan.depth.label}
        </p>
        <ol className="flex flex-wrap items-center gap-y-2 text-xs">
          {plan.depth.steps.map((step, i) => (
            <li key={step} className="flex items-center">
              <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-foreground">{step}</span>
              {i < plan.depth.steps.length - 1 && <ArrowRight className="mx-1 size-3 text-muted-foreground/60" />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{pct}% confidence</span>
    </div>
  );
}

function MarketList({ matches, empty }: { matches: MarketMatch[]; empty: string }) {
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {matches.map(({ market: m, matched }) => (
        <li key={m.id}>
          <Link
            href={`/markets/${m.id}`}
            className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate text-sm font-medium text-foreground group-hover:underline underline-offset-4">
                {m.name}
              </p>
              <div className="flex flex-wrap gap-1">
                {matched.map((r) => (
                  <span key={r} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>demand {m.demand_score}</span>
              <span>comp {m.competition_score}</span>
              <span>{Math.round(m.confidence * 100)}% conf</span>
              <span className="text-foreground">{m.evidence_count} evidence</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ExploreResult({ overview, markets }: { overview: MarketOverview | null; markets: MarketMatch[] }) {
  const lines: Array<[string, MarketOverview[keyof MarketOverview]]> = overview
    ? [
        ["Discussions", overview.discussionCounts],
        ["Buyer intent", overview.buyerIntentSignals],
        ["Trend", overview.trendDirection],
        ["Marketplace", overview.marketplaceActivity],
        ["Competition", overview.competitiveDensity],
      ]
    : [];
  return (
    <div className="space-y-6">
      {overview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ConfidenceMeter value={overview.confidence} />
            <Link
              href={`/search?q=${encodeURIComponent(overview.query)}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Full PRD §8 overview <ArrowRight className="size-3" />
            </Link>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
            {lines.map(([label, metric]) => {
              const m = metric as { observed: boolean; rawLabel: string };
              return (
                <div key={label} className="bg-card px-3 py-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
                  <dd className={`mt-1 text-xs ${m.observed ? "text-foreground" : "text-muted-foreground/70 italic"}`}>
                    {m.rawLabel}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Matching markets</h3>
        <MarketList matches={markets} empty="No evidence-backed markets observed for this query yet." />
      </div>
    </div>
  );
}

function ValidateResult({ report }: { report: ValidationReport }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Investigating exactly: </span>
          <span className="font-medium">“{report.concept}”</span>
        </p>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground">{report.signalsMatched} signals</span>
          <ConfidenceMeter value={report.confidence} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {VALIDATION_BLOCKS.map((key) => {
          const b = report.blocks[key];
          const isRisk = key === "risks";
          return (
            <section
              key={key}
              className={`rounded-lg border p-4 ${
                isRisk && b.items.length > 0
                  ? "border-amber-500/40 bg-amber-500/5 md:col-span-2"
                  : "border-border bg-card"
              } ${!b.observed ? "border-dashed" : ""}`}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                  {isRisk && <TriangleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />}
                  {b.title}
                </h4>
                <Badge variant="outline" className="text-[10px]">
                  {isRisk ? "derived from counts" : b.observed ? "observed" : "not observed"}
                </Badge>
              </header>
              <p className={`text-xs ${b.observed ? "text-muted-foreground" : "italic text-muted-foreground/70"}`}>
                {b.summary}
              </p>
              {b.items.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {b.items.map((item, i) => (
                    <li key={i} className="text-xs leading-relaxed text-foreground">
                      {item.text}
                      <Citations items={item.citations} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MonitorResult({ trend, datedSignals, note }: { trend: TopicTrendAnalysis; datedSignals: number; note: string }) {
  const windows = (["7d", "30d", "90d", "12m"] as const).map((w) => trend.windows[w]);
  const peak = Math.max(1, ...windows.map((w) => w.mentionCount));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-foreground px-2.5 py-1 font-mono text-xs uppercase tracking-wider text-background">
          {trend.classification.replace("_", " ")}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          WoW {trend.wowDeltaPercent > 0 ? "+" : ""}
          {trend.wowDeltaPercent}% · MoM {trend.momDeltaPercent > 0 ? "+" : ""}
          {trend.momDeltaPercent}% · {datedSignals} dated signals
        </span>
        <span className="ml-auto">
          <ConfidenceMeter value={trend.confidence} />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {windows.map((w) => (
          <div key={w.window} className="flex flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end justify-center rounded-md bg-muted/40 px-3">
              <div
                className="w-full max-w-10 rounded-t-sm bg-foreground/80 transition-[height] duration-500"
                style={{ height: `${Math.max(2, (w.mentionCount / peak) * 100)}%` }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums">{w.mentionCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{w.window}</span>
          </div>
        ))}
      </div>
      {trend.temporalEvidence.length > 0 && (
        <ul className="space-y-1 border-l-2 border-border pl-3">
          {trend.temporalEvidence.map((e) => (
            <li key={e} className="text-xs text-muted-foreground">
              {e}
            </li>
          ))}
        </ul>
      )}
      {trend.topPainQuote && (
        <p className="flex gap-2 text-xs italic text-foreground">
          <Quote className="size-3.5 shrink-0 text-muted-foreground" />
          {trend.topPainQuote}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function DeepResult({ run }: { run: RunSummary }) {
  const c = run.counts;
  const stats: Array<[string, number]> = [
    ["sources", c.sources],
    ["signals", c.signalsCollected],
    ["analyzed", c.signalsAnalyzed],
    ["markets", c.marketsCreated],
    ["opportunities", c.opportunitiesCreated],
    ["evidence", c.evidenceCount],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={run.status === "completed" ? "default" : "destructive"}>{run.status}</Badge>
        <span className="font-mono text-xs text-muted-foreground">
          {run.completeness.completenessPercentage}% complete
        </span>
        {run.error && <span className="text-xs text-destructive">{run.error}</span>}
      </div>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-6">
        {stats.map(([label, n]) => (
          <div key={label} className="bg-card px-3 py-3 text-center">
            <dd className="font-mono text-lg tabular-nums">{n}</dd>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <Link href="/" className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline">
        Open the explorer <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

export function ResearchView({ initialPrompt, recentRuns }: { initialPrompt: string; recentRuns: RecentRun[] }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [forcedMode, setForcedMode] = useState<ResearchMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ResearchResponse | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [runs, setRuns] = useState(recentRuns);

  const plan = useMemo(
    () => (prompt.trim() ? planResearch(prompt, forcedMode ?? undefined) : null),
    [prompt, forcedMode],
  );

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!plan || loading) return;
    setLoading(true);
    setNeedsKey(false);
    setResponse(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ...(forcedMode ? { mode: forcedMode } : {}) }),
      });
      const data = (await res.json()) as ResearchResponse;
      if (res.status === 401) setNeedsKey(true);
      setResponse(res.ok ? data : { ...data, error: data.error ?? `Request failed (${res.status})` });
      if (res.ok && data.runId && data.plan) {
        setRuns((prev) =>
          [
            {
              id: data.runId as string,
              query: data.plan!.query.raw,
              mode: data.plan!.mode,
              status: "completed",
              started_at: new Date().toISOString(),
              prompt_version: data.plan!.promptVersion,
            },
            ...prev,
          ].slice(0, 8),
        );
      }
    } catch (err) {
      setResponse({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  const result = response?.result;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5">
              <ArrowLeft className="size-4" />
              <span>Explorer</span>
            </Button>
          </Link>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Ask PDF Lab</h1>
          <Badge variant="outline" className="font-mono text-xs">
            PRD §26–§28
          </Badge>
        </div>
        <p className="max-w-sm text-xs text-muted-foreground">
          Plain-language questions become structured, evidence-only research. Nothing is invented: unobserved
          means unobserved.
        </p>
      </div>

      <form onSubmit={run} className="space-y-4">
        <div className="group relative flex items-center rounded-xl border border-border bg-card shadow-xs transition-colors focus-within:border-foreground/40">
          <span className="pointer-events-none flex items-center gap-1.5 pl-4 font-mono text-sm text-muted-foreground">
            <Terminal className="size-4" />
            <span className="hidden sm:inline">pdf-lab ›</span>
          </span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="PDF markets for busy parents · high intent + low competition · pdf-lab pc troubleshooting"
            maxLength={500}
            aria-label="Research question"
            className="h-14 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60 sm:text-base"
          />
          <Button type="submit" disabled={!plan || loading} className="mr-2 cursor-pointer gap-1.5">
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
            <span>{loading ? "Researching" : "Run"}</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Research mode">
          <button
            type="button"
            role="radio"
            aria-checked={forcedMode === null}
            onClick={() => setForcedMode(null)}
            className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              forcedMode === null
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Auto
          </button>
          {RESEARCH_MODES.map((m) => {
            const Meta = MODE_META[m];
            const active = forcedMode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                title={Meta.hint}
                onClick={() => setForcedMode(active ? null : m)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Meta.icon className="size-3.5" />
                {Meta.label}
              </button>
            );
          })}
        </div>

        {!prompt.trim() && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="cursor-pointer rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {plan && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ScanSearch className="size-4" /> Research plan
                </CardTitle>
                <CardDescription>What will run, before it runs.</CardDescription>
              </CardHeader>
              <CardContent>
                <PlanPanel plan={response?.plan ?? plan} />
              </CardContent>
            </Card>
          )}

          {loading && (
            <div className="space-y-3" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/60" />
              ))}
            </div>
          )}

          {needsKey && (
            <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <KeyRound className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Deep runs are locked until accounts ship (Phase 5).</p>
                <p className="text-xs text-muted-foreground">
                  The full pipeline spends source and model quota, so for now it runs only through the API with the
                  internal key: <code className="font-mono">POST /api/research</code> with an{" "}
                  <code className="font-mono">x-api-key</code> header. Explore, Validate, Hunt and Monitor work here.
                </p>
              </div>
            </div>
          )}

          {response?.error && !needsKey && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              {response.error}
            </div>
          )}

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {MODE_META[result.mode].label} result
                  {result.mode === "hunt" && (
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                      {result.totalMatches} matches
                    </span>
                  )}
                </CardTitle>
                {response?.runId && (
                  <CardDescription className="font-mono text-[11px]">run {response.runId}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {result.mode === "explore" && <ExploreResult overview={result.overview} markets={result.markets} />}
                {result.mode === "hunt" && (
                  <MarketList
                    matches={result.markets}
                    empty="No evidence-backed market passes these filters yet. Loosen a filter or run Deep research on a niche."
                  />
                )}
                {result.mode === "validate" && <ValidateResult report={result.report} />}
                {result.mode === "monitor" && (
                  <MonitorResult trend={result.trend} datedSignals={result.datedSignals} note={result.note} />
                )}
                {result.mode === "deep" && <DeepResult run={result.run} />}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent runs</h2>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No planned runs yet.</p>
          ) : (
            <ul className="space-y-1">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(r.query);
                      setForcedMode(r.mode as ResearchMode);
                    }}
                    className="w-full cursor-pointer rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <p className="truncate text-xs text-foreground">{r.query}</p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <span className="uppercase">{r.mode}</span>
                      <span className="truncate">{r.prompt_version}</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
