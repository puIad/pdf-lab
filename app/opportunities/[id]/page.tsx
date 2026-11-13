// app/opportunities/[id]/page.tsx — Opportunity detail report per PRD §47 & docs/09-UX-SPEC.md.
// Every block shows a stored value or "Not observed" (Part 6.14): no fixed copy, no default
// scores, prices or page counts. Outline, bonus angles and keywords live in the brief, which builds
// them from observed phrases.

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/db/client";
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  FileText,
  DollarSign,
  Zap,
  ListOrdered,
  MessageSquare,
  AlertTriangle,
  Flame,
  Compass,
  Users,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  EvidenceList,
  EvidenceDialog,
  FactsInterpretationSuggestion,
} from "@/components/evidence";
import { parseEvidenceClaim, type EvidenceRow } from "@/lib/evidence/types";
import { NOT_OBSERVED, platformCounts } from "@/lib/report/observed";

export const dynamic = "force-dynamic";

interface OpportunityPageProps {
  params: Promise<{ id: string }>;
}

function NotObserved({ what }: { what: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {NOT_OBSERVED}. {what}
    </p>
  );
}

export default async function OpportunityDetailPage(props: OpportunityPageProps) {
  const { id } = await props.params;

  if (!id) {
    notFound();
  }

  const supabase = createServiceSupabaseClient();

  // 1. Fetch opportunity record
  const { data: opp, error: oppErr } = await supabase
    .from("opportunities")
    .select(`
      id, market_id, title, target_audience, problem, solution, format,
      price_range, opportunity_score, confidence, created_at, matching_signals, market_signal_count,
      markets (
        id, name, trend, demand_score, pdf_fit_score
      )
    `)
    .eq("id", id)
    .single();

  if (oppErr || !opp) {
    notFound();
  }

  // 2. Evidence of this opportunity, evidence of its market, and the market's stored competitors
  const [{ data: evidenceRows }, { data: marketEvidence }, { data: competitors }] = await Promise.all([
    supabase
      .from("evidence")
      .select("id, entity_type, entity_id, source_id, claim, excerpt, url, created_at")
      .eq("entity_id", id),
    supabase
      .from("evidence")
      .select("id, entity_type, entity_id, source_id, claim, excerpt, url, created_at")
      .eq("entity_id", opp.market_id),
    supabase.from("competitors").select("platform").eq("market_id", opp.market_id),
  ]);

  const market = Array.isArray(opp.markets) ? opp.markets[0] : opp.markets;
  const directEvidence = (evidenceRows ?? []) as EvidenceRow[];
  const marketRows = (marketEvidence ?? []) as EvidenceRow[];

  const score = typeof opp.opportunity_score === "number" ? Math.round(opp.opportunity_score) : null;
  const confPct = Math.round(opp.confidence * 100);
  const formatLabel = opp.format ? opp.format.replace("_", " ") : NOT_OBSERVED;
  const priceRange = opp.price_range || NOT_OBSERVED;
  const trend = market?.trend || "unknown";

  // Observed rows behind the blocks below
  const quotes = directEvidence.filter((e) => e.excerpt).slice(0, 4);
  const sourcesCited = new Set(directEvidence.map((e) => e.source_id).filter(Boolean)).size;
  const trendClaims = marketRows.filter((e) => e.entity_type === "trend").map((e) => parseEvidenceClaim(e.claim).rawClaim);
  const gapRows = marketRows.filter(
    (e) => e.entity_type === "competition" && parseEvidenceClaim(e.claim).rawClaim.startsWith("Product gap"),
  );
  const platforms = platformCounts(competitors ?? []);
  const competitorTotal = platforms.reduce((n, p) => n + p.count, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href={market?.id ? `/markets/${market.id}` : "/"}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to {market?.name || "Market"}</span>
            </Link>
            <span className="hidden text-border sm:inline">/</span>
            <span className="hidden text-xs font-medium text-foreground truncate max-w-md sm:inline">
              {opp.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/briefs/opportunity/${opp.id}`}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted"
            >
              <FileText className="size-3.5" />
              Build brief
            </Link>
            <EvidenceDialog
              title="Opportunity Evidence Citations"
              subtitle={`${directEvidence.length} direct evidence items backing this specific product spec`}
              items={directEvidence}
              triggerText={`Citations (${directEvidence.length})`}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-8 flex flex-col gap-8">
        {/* Block 1: Header & Key Metrics */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs uppercase tracking-wide">
              Product Opportunity Spec
            </Badge>
            <Badge variant="secondary" className="capitalize text-xs font-semibold bg-primary/10 text-primary">
              <FileText className="mr-1 size-3" />
              Format: {formatLabel}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              <DollarSign className="mr-0.5 size-3 text-emerald-500" />
              Price: {priceRange}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${
                confPct >= 70 ? "text-emerald-600 border-emerald-500/40" : "text-amber-600 border-amber-500/40"
              }`}
            >
              <ShieldCheck className="mr-1 size-3" />
              {confPct}% Confidence
            </Badge>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {opp.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-muted-foreground">
            <div>
              Target Market:{" "}
              <Link
                href={market?.id ? `/markets/${market.id}` : "#"}
                className="font-medium text-foreground hover:underline text-primary"
              >
                {market?.name}
              </Link>
            </div>
            <div>
              Opportunity Score:{" "}
              <span className="font-bold text-foreground font-mono">{score === null ? NOT_OBSERVED : `${score} / 100`}</span>
            </div>
            <div>Direct Citations: <span className="font-bold text-foreground font-mono">{directEvidence.length} verified rows</span></div>
            {opp.matching_signals != null && opp.market_signal_count != null && (
              <div>
                Demand:{" "}
                <span className="font-bold text-foreground font-mono">
                  {opp.matching_signals} of {opp.market_signal_count}
                </span>{" "}
                discussions in this market mention this problem
              </div>
            )}
          </div>
        </div>

        {/* Blocks 2 and 3: stored audience and problem */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-primary">
                <Users className="size-4" />
                <CardTitle className="text-sm font-semibold">2. Target Customer</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
              {opp.target_audience ? (
                <div className="font-semibold text-foreground text-sm">{opp.target_audience}</div>
              ) : (
                <NotObserved what="No audience was extracted for this opportunity." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertTriangle className="size-4" />
                <CardTitle className="text-sm font-semibold">3. Core Problem (Observed Pain)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
              {opp.problem ? (
                <div className="font-semibold text-foreground text-sm">{opp.problem}</div>
              ) : (
                <NotObserved what="No problem statement is stored for this opportunity." />
              )}
            </CardContent>
          </Card>
        </section>

        {/* Blocks 4 and 5 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                <CardTitle className="text-sm font-semibold">4. Desired Outcome</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <NotObserved what="No outcome statement is stored with an opportunity." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-amber-500">
                <Flame className="size-4" />
                <CardTitle className="text-sm font-semibold">5. Why Now (Trend)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">Market trend:</span>
                <Badge variant="secondary" className="capitalize text-[11px]">
                  {trend}
                </Badge>
              </div>
              {trendClaims.length > 0 ? (
                trendClaims.slice(0, 2).map((claim, idx) => <p key={idx}>{claim}</p>)
              ) : (
                <p>No trend evidence row is stored for this market.</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Block 6: format and solution are suggestions, not observations */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-primary">
              <Compass className="size-4" />
              <CardTitle className="text-sm font-semibold">6. Suggested Format & Solution</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="capitalize text-xs font-semibold">
                Format: {formatLabel}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Suggestion, not an observation
              </Badge>
            </div>
            {opp.solution ? (
              <p className="text-sm text-foreground">{opp.solution}</p>
            ) : (
              <NotObserved what="No solution text is stored for this opportunity." />
            )}
          </CardContent>
        </Card>

        {/* Blocks 7, 8 and 10: built in the brief from observed phrases */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-foreground">
              <ListOrdered className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">7, 8, 10. Outline, Bonus Angles & Keywords</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
            <p>
              The brief builds these from observed search phrases and stored evidence, each line cited.
            </p>
            <Link
              href={`/briefs/opportunity/${opp.id}`}
              className="inline-flex w-fit items-center gap-1 font-medium text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              Open the brief
            </Link>
          </CardContent>
        </Card>

        {/* Block 9: observed price */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-foreground">
              <DollarSign className="size-4 text-emerald-500" />
              <CardTitle className="text-sm font-semibold">9. Observed Competitor Price Range</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
            <span className="text-sm font-bold font-mono text-foreground">{priceRange}</span>
            <p>
              {opp.price_range
                ? "Paid prices of the listings stored for this market. Not a recommendation."
                : "No paid listing price is stored for this market."}
            </p>
          </CardContent>
        </Card>

        {/* Block 11: verbatim excerpts from this opportunity's evidence */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-foreground">
              <MessageSquare className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">11. Customer Language (Verbatim)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
            {quotes.length === 0 ? (
              <NotObserved what="None of this opportunity's evidence rows carries an excerpt." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quotes.map((e) => (
                  <div key={e.id} className="rounded bg-muted/50 p-2.5 text-[11px] border-l-2 border-primary/50 flex flex-col gap-1">
                    <span className="italic text-foreground">&ldquo;{e.excerpt}&rdquo;</span>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <span>Source</span>
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Block 12: stored competitors and review-mined gaps of the market */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-foreground">
              <Zap className="size-4 text-amber-500" />
              <CardTitle className="text-sm font-semibold">12. Competition & Observed Gaps</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs leading-relaxed text-muted-foreground flex flex-col gap-2">
            {competitorTotal === 0 ? (
              <p>
                None observed. No marketplace listing is stored for this market, which does not mean none exists.
              </p>
            ) : (
              <p>
                <strong className="text-foreground">{competitorTotal} listings stored for this market:</strong>{" "}
                {platforms.map((p) => `${p.platform} ${p.count}`).join(", ")}.
              </p>
            )}
            {gapRows.length === 0 ? (
              <p>No review-mined gap is stored for this market.</p>
            ) : (
              gapRows.slice(0, 3).map((e) => (
                <div key={e.id} className="rounded bg-muted/50 p-2.5 text-[11px] flex flex-col gap-1">
                  <span className="text-foreground">{parseEvidenceClaim(e.claim).rawClaim}</span>
                  {e.excerpt && <span className="italic">&ldquo;{e.excerpt}&rdquo;</span>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Block 13: Three-Layer Verification (QC Rule 5) */}
        <section>
          <FactsInterpretationSuggestion
            facts={{
              signalsCount: directEvidence.length,
              sourcesCount: sourcesCited,
              sampleExcerpts: quotes.slice(0, 2).map((e) => ({ quote: e.excerpt as string, url: e.url })),
            }}
            interpretation={{
              demandScore: score,
              trendLabel: trend,
              urgency: NOT_OBSERVED,
              confidence: opp.confidence,
              sampleSizeNote: `Calculated from ${directEvidence.length} evidence rows`,
            }}
            suggestion={{
              format: opp.format || NOT_OBSERVED,
              mechanism: opp.solution || NOT_OBSERVED,
              outcome: NOT_OBSERVED,
              priceRange,
            }}
          />
        </section>

        {/* Block 14: Verifiable Evidence Sources & Citations */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              14. Verifiable Evidence Sources & Citations
            </h2>
            <Badge variant="outline" className="text-xs font-mono uppercase">
              QC Rule 1 Enforced ({directEvidence.length} rows)
            </Badge>
          </div>
          <EvidenceList
            items={directEvidence}
            emptyMessage="No direct evidence citations recorded for this opportunity."
          />
        </section>
      </main>
    </div>
  );
}
