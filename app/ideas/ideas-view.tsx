"use client";

// app/ideas/ideas-view.tsx — Quick ideas console (Phase 3 Part 3.6).
// Facts (demand basis, trend basis, sources) are shown next to every score; the specificity
// badge describes the phrase and is labeled as not a competition claim (QC Rules 3–5).

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, Flame, ListOrdered, RefreshCw, Search, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import type { IdeaFormat, IdeasResult, QuickIdea } from "@/lib/ideas/ideas";
import { suggestOutline } from "@/lib/ideas/outline";

interface SourceStatus {
  key: string;
  displayName: string;
  status: "ok" | "skipped" | "failed";
  collected: number;
  inserted: number;
  duplicates: number;
  error?: string;
}

type IdeasResponse = IdeasResult & { sources: SourceStatus[]; scannedAt: string; error?: string };

const FORMATS: IdeaFormat[] = ["Guide", "Checklist", "Planner", "Worksheet", "Cheat sheet", "Ebook", "Report"];
const TABS = [
  { key: "all", label: "All ideas", test: () => true },
  { key: "questions", label: "Questions", test: (i: QuickIdea) => i.isQuestion },
  { key: "howto", label: "How-to", test: (i: QuickIdea) => i.intent === "howto" },
  { key: "buyer", label: "Buyer intent", test: (i: QuickIdea) => i.intent === "buyer" || i.engines.includes("amazon") },
  { key: "rising", label: "Rising", test: (i: QuickIdea) => i.trend !== null },
] as const;
const ENGINE_LABEL: Record<string, string> = { google: "G", youtube: "YT", bing: "B", ddg: "DDG", amazon: "A" };
const SPECIFICITY_LABEL = { broad: "Broad phrase", mid: "Mid-tail phrase", long_tail: "Long-tail phrase" };
const TONE = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  mid: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  neutral: "border-border bg-muted text-muted-foreground",
};
const LOADING_STEPS = [
  "Expanding the topic across 5 suggest engines…",
  "Reading Google Trends related queries…",
  "Checking Wikipedia pageviews…",
  "Storing evidence and scoring ideas…",
];

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div title={hint} className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Pill({ tone, children, title }: { tone: keyof typeof TONE; children: React.ReactNode; title: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

function IdeaCard({ idea, related }: { idea: QuickIdea; related: QuickIdea[] }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<IdeaFormat>(idea.format);
  const [offset, setOffset] = useState(0);
  const outline = useMemo(
    () => (open ? suggestOutline({ phrase: idea.phrase, format, related, offset }) : []),
    [open, idea.phrase, format, related, offset],
  );
  const effortTone = { Easy: "good", Medium: "mid", Hard: "bad" } as const;
  const interestTone = { High: "good", Medium: "mid", Low: "bad" } as const;

  return (
    <Card className="flex flex-col gap-0 py-0">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="uppercase tracking-wide">{idea.format}</Badge>
          {idea.trend ? (
            <Badge variant="secondary" title={idea.trendBasis ?? ""} className="gap-1">
              {idea.trend === "breakout" ? <Flame /> : <TrendingUp />}
              {idea.trend === "breakout" ? "Breakout" : "Rising"}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground" title="No Google Trends rising data for this phrase (QC Rule 2)">
              trend not observed
            </span>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-snug">{idea.title}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Search className="size-3 shrink-0" />
            <span className="truncate">“{idea.phrase}”</span>
          </p>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
          <div className="flex flex-col items-center rounded-lg border border-border px-3 py-2" title="Opportunity = 55% demand + 45% PDF fit, +10 rising / +15 breakout (uncalibrated, DEC-008)">
            <span className="font-mono text-2xl font-bold tabular-nums">{idea.opportunity}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Opportunity</span>
          </div>
          <div className="space-y-2">
            <Meter label="Demand" value={idea.demand} hint={idea.demandBasis} />
            <Meter label="PDF fit" value={idea.fit} hint="How well the phrase works as a PDF: how-to, questions and explicit formats score high; tools and navigational searches low" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {idea.demandBasis} · confidence {Math.round(idea.confidence * 100)}%
        </p>

        <div className="flex flex-wrap gap-1.5">
          <Pill tone={effortTone[idea.effort]} title={`Effort to make a ${idea.format.toLowerCase()}`}>
            {idea.effort === "Hard" ? "Harder to make" : idea.effort === "Easy" ? "Easy to make" : "Medium effort"}
          </Pill>
          <Pill tone={interestTone[idea.interest]} title="Band on the demand score">
            {idea.interest} interest
          </Pill>
          {/* Neutral on purpose: a color would read as a competition verdict nobody observed (QC Rule 3). */}
          <Pill tone="neutral" title="Describes the search phrase only. Competitors were not observed for it (QC Rule 3).">
            {SPECIFICITY_LABEL[idea.specificity]}
          </Pill>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-1">
            {idea.engines.map((e) => (
              <span key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]" title={`Suggested by ${e}`}>
                {ENGINE_LABEL[e] ?? e}
              </span>
            ))}
            {idea.evidence.map((ev) =>
              ev.url ? (
                <a key={ev.source_id} href={ev.url} target="_blank" rel="noopener noreferrer" title={ev.title ?? ev.source} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                  {ev.source}
                  <ExternalLink className="size-3" />
                </a>
              ) : null,
            )}
          </div>
          <Button size="sm" variant={open ? "secondary" : "outline"} className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
            <ListOrdered />
            Outline
          </Button>
        </div>

        {open && (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <NativeSelect size="sm" value={format} onChange={(e) => setFormat(e.target.value as IdeaFormat)} aria-label="Outline format">
                {FORMATS.map((f) => (
                  <NativeSelectOption key={f} value={f}>
                    {f}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button size="icon-sm" variant="ghost" className="cursor-pointer" title="Suggest different sections" onClick={() => setOffset((o) => o + 3)}>
                <RefreshCw />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="cursor-pointer"
                title="Copy outline"
                onClick={() =>
                  // Denied clipboard permission is not an error worth surfacing; the outline stays on screen.
                  navigator.clipboard?.writeText([idea.title, ...outline.map((h, i) => `${i + 1}. ${h}`)].join("\n")).catch(() => undefined)
                }
              >
                <Copy />
              </Button>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs">
              {outline.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
            <p className="text-[10px] text-muted-foreground">Headings come from this topic&apos;s other searches; generic sections fill the rest.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function IdeasView({ initialSeed }: { initialSeed: string }) {
  const [seed, setSeed] = useState(initialSeed);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<IdeasResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [sort, setSort] = useState<"opportunity" | "demand" | "az">("opportunity");
  const [shown, setShown] = useState(24);

  async function scan(value: string) {
    const s = value.trim();
    if (s.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    setData(null);
    setStep(0);
    const timer = setInterval(() => setStep((n) => Math.min(n + 1, LOADING_STEPS.length - 1)), 4000);
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: s }),
      });
      const body = (await res.json()) as IdeasResponse;
      if (!res.ok) setError(body.error ?? `Request failed (${res.status})`);
      else {
        setData(body);
        setTab("all");
        setShown(24);
        window.history.replaceState(null, "", `/ideas?q=${encodeURIComponent(s)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  const ideas = useMemo(() => data?.ideas ?? [], [data]);
  const visible = useMemo(() => {
    const t = TABS.find((x) => x.key === tab) ?? TABS[0];
    const list = ideas.filter((i) => t.test(i));
    if (sort === "demand") list.sort((a, b) => b.demand - a.demand);
    else if (sort === "az") list.sort((a, b) => a.phrase.localeCompare(b.phrase));
    return list;
  }, [ideas, tab, sort]);
  const related = useMemo(() => ideas.slice(0, 40), [ideas]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5">
              <ArrowLeft className="size-4" />
              <span>Explorer</span>
            </Button>
          </Link>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Quick ideas</h1>
          <Badge variant="outline" className="font-mono text-xs">
            Part 3.6
          </Badge>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          One topic in, ranked PDF ideas out, from what people type into search boxes. Every score shows the counts behind it.
          Scores are not calibrated yet.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void scan(seed);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex flex-1 items-center rounded-xl border border-border bg-card shadow-xs focus-within:border-foreground/40">
          <Search className="pointer-events-none ml-4 size-4 text-muted-foreground" />
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            maxLength={80}
            placeholder="A broad topic, 1 to 3 words: budgeting, keto diet, toddler sleep…"
            aria-label="Topic"
            className="h-12 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" size="lg" className="h-12 cursor-pointer px-6" disabled={loading || seed.trim().length < 2}>
          {loading ? "Scanning…" : "Find ideas"}
        </Button>
      </form>

      {loading && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{LOADING_STEPS[step]} This takes about 30 seconds.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="space-y-1 p-6">
            <p className="text-sm font-semibold">That scan didn&apos;t finish</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && (
        <section className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold capitalize">{data.seed}</h2>
              {data.topic.length ? (
                data.topic.map((t) => (
                  <p key={t.evidence.source_id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{t.direction}</span>
                    {t.changePct !== null ? ` (${t.changePct > 0 ? "+" : ""}${t.changePct}%)` : ""} · {t.basis}{" "}
                    {t.evidence.url && (
                      <a href={t.evidence.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                        source
                      </a>
                    )}
                  </p>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Topic trend: not observed (no Trends line or matching Wikipedia article).</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.sources.map((s) => (
                  <span
                    key={s.key}
                    title={s.error ?? `${s.collected} collected, ${s.inserted} new, ${s.duplicates} already stored`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${s.status === "ok" ? TONE.good : s.status === "skipped" ? TONE.mid : TONE.bad}`}
                  >
                    {s.displayName}
                    <span className="font-mono">{s.status === "ok" ? s.collected : s.status}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 self-start">
              {[
                ["Ideas", data.stats.ideas],
                ["Avg demand", data.stats.avgDemand],
                ["Rising", data.stats.rising],
                ["Questions", data.stats.questions],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border px-3 py-2 text-center">
                  <div className="font-mono text-lg font-bold tabular-nums">{value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {ideas.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No stored signals for this topic, so no ideas. Check the source chips above: a skipped or failed source explains it.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {TABS.map((t) => (
                    <Button
                      key={t.key}
                      size="sm"
                      variant={tab === t.key ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        setTab(t.key);
                        setShown(24);
                      }}
                    >
                      {t.label}
                      <span className="font-mono text-[10px] opacity-70">{ideas.filter((i) => t.test(i)).length}</span>
                    </Button>
                  ))}
                </div>
                <NativeSelect size="sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort ideas" className="sm:w-48">
                  <NativeSelectOption value="opportunity">Best opportunity</NativeSelectOption>
                  <NativeSelectOption value="demand">Highest demand</NativeSelectOption>
                  <NativeSelectOption value="az">A–Z</NativeSelectOption>
                </NativeSelect>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.slice(0, shown).map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} related={related} />
                ))}
              </div>
              {visible.length > shown && (
                <div className="flex justify-center">
                  <Button variant="outline" className="cursor-pointer" onClick={() => setShown((n) => n + 24)}>
                    Show more ({visible.length - shown} left)
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Phrase specificity is not a competition measure: competitors were not observed for these phrases (QC Rule 3). Run Deep
                research on a phrase for observed marketplace competition.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
