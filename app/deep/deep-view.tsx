// app/deep/deep-view.tsx — the three steps of a pasted Deep run (Part 6.15, DEC-015):
// 1 collect signals, 2 copy the prompt into a chat model, 3 paste its reply back.
// The run id lives in the URL (?run=), so the page survives a reload or a trip to another tab.

"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, ClipboardCopy, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const MODEL_URL = "https://gemini.google.com/app";

interface SourceResult {
  key: string;
  status: string;
  count: number;
}

interface PausedRun {
  runId: string;
  seed: string;
  status: string;
  signals: number;
  prompt: string | null;
  sources?: SourceResult[];
}

interface ReplyCounts {
  analysed: number;
  total: number;
  /** Signals the model found unrelated to the topic; they are in no market. */
  noMarket?: number;
  problems: Array<{ n: number; reason: string }>;
  missing: number[];
}

interface FinishedRun extends ReplyCounts {
  run: {
    runId: string;
    status: string;
    error?: string | null;
    counts: { marketsCreated: number; opportunitiesCreated: number; evidenceCount: number; signalsAnalyzed: number; signalsCollected: number };
    trace: Array<{ state: string; message?: string; counts?: Record<string, number> }>;
  };
}

type Phase = "idle" | "collecting" | "waiting" | "finishing" | "done";

// A refusal (signed out, limit used up, someone else's run) arrives with its reason in `error`.
const explain = (status: number, body: { error?: string }): string => body.error ?? `Request failed (${status})`;

function StepHeader({ n, title, state }: { n: number; title: string; state: "todo" | "active" | "done" }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold ${
          state === "done"
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : state === "active"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground"
        }`}
      >
        {state === "done" ? <Check className="size-3.5" /> : n}
      </span>
      <CardTitle className={`text-sm font-semibold ${state === "todo" ? "text-muted-foreground" : ""}`}>{title}</CardTitle>
    </div>
  );
}

function ReplyProblems({ counts }: { counts: ReplyCounts }) {
  if (counts.problems.length === 0 && counts.missing.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <p className="font-medium text-foreground">
        {counts.analysed} of {counts.total} items were valid.
      </p>
      {counts.missing.length > 0 && (
        <p className="text-muted-foreground">
          Missing from the reply: {counts.missing.slice(0, 30).map((n) => `[${n}]`).join(" ")}
          {counts.missing.length > 30 ? ` and ${counts.missing.length - 30} more` : ""}
        </p>
      )}
      {counts.problems.length > 0 && (
        <ul className="space-y-0.5 text-muted-foreground">
          {counts.problems.slice(0, 12).map((p) => (
            <li key={p.n}>
              <span className="font-mono text-foreground">[{p.n}]</span> {p.reason}
            </li>
          ))}
          {counts.problems.length > 12 && <li>and {counts.problems.length - 12} more</li>}
        </ul>
      )}
    </div>
  );
}

export function DeepView({
  initialSeed,
  initialRun,
  initialError,
}: {
  initialSeed: string;
  /** A run reopened through ?run=<id>, loaded on the server. */
  initialRun: PausedRun | null;
  initialError: string | null;
}) {
  const [seed, setSeed] = useState(initialSeed);
  const [phase, setPhase] = useState<Phase>(initialRun ? (initialRun.status === "classifying" ? "waiting" : "done") : "idle");
  const [paused, setPaused] = useState<PausedRun | null>(initialRun);
  const [reply, setReply] = useState("");
  const [rejected, setRejected] = useState<ReplyCounts | null>(null);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  async function collect(e: React.FormEvent) {
    e.preventDefault();
    const topic = seed.trim();
    if (topic.length < 2 || phase === "collecting") return;
    setPhase("collecting");
    setError(null);
    setPaused(null);
    setFinished(null);
    setRejected(null);
    setReply("");
    try {
      const res = await fetch("/api/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: topic }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(explain(res.status, body));
        setPhase("idle");
        return;
      }
      setPaused(body);
      setPhase("waiting");
      // Put the run in the URL without a navigation, so a reload reopens it and the page keeps its state.
      window.history.replaceState(null, "", `?run=${body.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setPhase("idle");
    }
  }

  async function copyPrompt() {
    if (!paused?.prompt) return;
    try {
      await navigator.clipboard.writeText(paused.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied: select the text so Ctrl+C works.
      promptRef.current?.select();
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!paused || reply.trim().length === 0 || phase === "finishing") return;
    setPhase("finishing");
    setError(null);
    setRejected(null);
    try {
      const res = await fetch(`/api/deep/${paused.runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply }),
      });
      const body = await res.json();
      if (res.status === 422) {
        setRejected(body);
        setError(body.error);
        setPhase("waiting");
        return;
      }
      if (!body.run) {
        setError(explain(res.status, body));
        setPhase("waiting");
        return;
      }
      setFinished(body);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setPhase("waiting");
    }
  }

  const hasRun = phase === "waiting" || phase === "finishing" || phase === "done";
  const completed = finished?.run.status === "completed";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <Link href={seed.trim() ? `/?q=${encodeURIComponent(seed.trim())}` : "/"}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Ideas
            </Button>
          </Link>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Deep research</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          PDF Lab collects what people search and post about a topic. A chat model reads those signals and names the
          problem behind each one. You carry the text across: copy the prompt out, paste the reply back. Every market and
          opportunity then traces to a signal PDF Lab collected.
        </p>
      </div>

      {/* Step 1 */}
      <Card>
        <CardHeader className="pb-3">
          <StepHeader n={1} title="Collect signals for a topic" state={hasRun ? "done" : "active"} />
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={collect} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex flex-1 items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <Search className="pointer-events-none ml-3 size-4 text-muted-foreground" />
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                maxLength={80}
                disabled={phase === "collecting" || phase === "finishing"}
                placeholder="A broad topic, 1 to 3 words: budgeting, meal prep, home workout"
                aria-label="Topic"
                className="h-10 w-full bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
            </div>
            <Button type="submit" size="lg" className="h-10 px-4" disabled={seed.trim().length < 2 || phase === "collecting" || phase === "finishing"}>
              {phase === "collecting" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Collecting
                </>
              ) : hasRun ? (
                "Start a new run"
              ) : (
                "Collect"
              )}
            </Button>
          </form>
          {phase === "collecting" && (
            <p className="text-xs text-muted-foreground" role="status">
              Asking Google Trends, web search and the marketplaces. This takes about 15 to 30 seconds.
            </p>
          )}
          {paused && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <span className="font-medium text-foreground">{paused.signals} signals to analyse</span>
              {paused.sources?.map((s) => (
                <Badge key={s.key} variant="outline" className={`font-mono text-[11px] ${s.status === "ok" ? "" : "text-muted-foreground line-through"}`} title={`${s.key}: ${s.status}`}>
                  {s.key} {s.status === "ok" ? s.count : s.status}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 */}
      <Card className={hasRun ? "" : "opacity-60"}>
        <CardHeader className="pb-3">
          <StepHeader n={2} title="Copy the prompt into Gemini" state={phase === "done" ? "done" : hasRun ? "active" : "todo"} />
        </CardHeader>
        {paused?.prompt && (
          <CardContent className="space-y-3">
            <Textarea
              ref={promptRef}
              readOnly
              value={paused.prompt}
              aria-label="Prompt to copy"
              className="h-40 resize-y font-mono text-xs md:text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={copyPrompt} className="gap-1.5">
                {copied ? <Check /> : <ClipboardCopy />}
                {copied ? "Copied" : "Copy prompt"}
              </Button>
              <a href={MODEL_URL} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="outline" className="gap-1.5">
                  Open Gemini
                  <ArrowUpRight />
                </Button>
              </a>
              <span className="text-xs text-muted-foreground">
                {paused.prompt.length.toLocaleString()} characters. Paste it as one message and wait for the JSON.
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Step 3 */}
      <Card className={hasRun ? "" : "opacity-60"}>
        <CardHeader className="pb-3">
          <StepHeader n={3} title="Paste the reply back" state={phase === "done" ? "done" : hasRun ? "active" : "todo"} />
        </CardHeader>
        {(phase === "waiting" || phase === "finishing") && (
          <CardContent>
            <form onSubmit={submitReply} className="space-y-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={phase === "finishing"}
                aria-label="Model reply"
                aria-invalid={rejected ? true : undefined}
                placeholder={'Paste the whole reply here. It should contain {"items": [ … ]}'}
                className="h-40 resize-y font-mono text-xs md:text-xs"
              />
              {rejected && <ReplyProblems counts={rejected} />}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={reply.trim().length === 0 || phase === "finishing"}>
                  {phase === "finishing" ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Building the report
                    </>
                  ) : (
                    "Check and build the report"
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Each item is checked on its own. Wrong or missing ones are listed, never guessed.
                </span>
              </div>
            </form>
          </CardContent>
        )}
        {phase === "done" && (
          <CardContent className="space-y-3">
            {finished ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Signals analysed", `${finished.analysed} of ${finished.total}`],
                    ["Markets", finished.run.counts.marketsCreated],
                    ["Opportunities", finished.run.counts.opportunitiesCreated],
                    ["Evidence rows", finished.run.counts.evidenceCount],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border p-3">
                      <div className="text-[11px] text-muted-foreground">{label}</div>
                      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
                <ReplyProblems counts={finished} />
                {(finished.noMarket ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {finished.noMarket} signals had nothing to do with the topic according to the model. They are in no market.
                  </p>
                )}
                {completed ? (
                  <Link href={`/markets?run=${finished.run.runId}`}>
                    <Button className="gap-1.5">
                      Open this run&apos;s markets
                      <ArrowUpRight />
                    </Button>
                  </Link>
                ) : (
                  <p className="text-sm text-destructive" role="alert">
                    The run failed: {finished.run.error ?? "no reason recorded"}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This run is {paused?.status}.{" "}
                {paused?.status === "completed" && (
                  <Link href={`/markets?run=${paused.runId}`} className="font-medium text-foreground underline underline-offset-4">
                    Open its markets
                  </Link>
                )}
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
