"use client";

// components/brief/brief-view.tsx — build-ready brief (Phase 3 Part 3.10). Facts, rule-based
// suggestions and AI interpretation are labeled apart (QC Rule 5). AI notes are written on click
// only, and exports rebuild the brief server-side with the notes written here.

import React, { useState } from "react";
import { Copy, Download, ExternalLink, FileText, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerdictPanel } from "@/components/research/verdict-panel";
import type { Brief, BriefAiNote, BriefCite, BriefFact } from "@/lib/brief/types";
import { ETSY_TAGS_MAX, ETSY_TITLE_MAX } from "@/lib/brief/etsy";

const DESCRIPTION_KEY = "description";

type Layer = "fact" | "suggestion" | "ai";
const LAYER: Record<Layer, { label: string; className: string }> = {
  fact: { label: "Fact", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" },
  suggestion: { label: "Suggestion", className: "border-sky-500/40 text-sky-700 dark:text-sky-400" },
  ai: { label: "AI interpretation", className: "border-violet-500/40 text-violet-700 dark:text-violet-400" },
};

function LayerTag({ layer }: { layer: Layer }) {
  return (
    <Badge variant="outline" className={`h-5 shrink-0 px-1.5 text-[10px] font-medium ${LAYER[layer].className}`}>
      {LAYER[layer].label}
    </Badge>
  );
}

function Cites({ cites }: { cites: BriefCite[] }) {
  if (!cites.length) return null;
  const shown = cites.slice(0, 6);
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 align-middle text-[11px] text-muted-foreground">
      {shown.map((c, i) =>
        c.url ? (
          <a key={`${c.id}-${i}`} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground" title={c.id}>
            {c.source} {i + 1}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span key={`${c.id}-${i}`} title={`stored row ${c.id}`}>
            {c.source} {i + 1}
          </span>
        ),
      )}
      {cites.length > shown.length && <span>+{cites.length - shown.length} more</span>}
    </span>
  );
}

function FactLine({ fact, quote = false }: { fact: BriefFact; quote?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <LayerTag layer="fact" />
      <p className={`min-w-0 text-sm leading-relaxed ${quote ? "italic" : ""}`}>
        {fact.text}
        <Cites cites={fact.cites} />
      </p>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent className="space-y-2.5">{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function NoteSlot({
  note,
  label,
  busy,
  me,
  error,
  cites,
  onWrite,
}: {
  note: BriefAiNote | undefined;
  label: string;
  busy: string | null;
  me: string;
  error: string | undefined;
  cites: Map<string, BriefCite>;
  onWrite: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {note && (
        <div className="flex items-start gap-2 rounded-md bg-violet-500/5 p-2">
          <LayerTag layer="ai" />
          <p className="min-w-0 text-sm leading-relaxed">
            {note.text}
            <Cites cites={note.citeIds.map((id) => cites.get(id)).filter((c): c is BriefCite => !!c)} />
            <span className="ml-1 text-[10px] text-muted-foreground">({note.model})</span>
          </p>
        </div>
      )}
      <Button size="xs" variant="ghost" className="cursor-pointer text-muted-foreground" disabled={busy !== null} onClick={onWrite}>
        {busy === me ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {note ? "Rewrite" : label}
      </Button>
      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

export function BriefView({ brief }: { brief: Brief }) {
  const [notes, setNotes] = useState<Record<string, BriefAiNote>>(brief.notes);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<"md" | "docx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const cites = new Map<string, BriefCite>();
  for (const f of [brief.promise, brief.audience, ...brief.buyerLanguage, ...brief.keywords, brief.whereToSell?.fact ?? null, brief.priceAnchor, ...brief.bonusAngles]) {
    if (f) for (const c of f.cites) if (!cites.has(c.id)) cites.set(c.id, c);
  }

  async function writeNote(key: string) {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const res = await fetch("/api/briefs/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: brief.source, key }),
      });
      const body = (await res.json()) as { note?: BriefAiNote; error?: string };
      if (!res.ok || !body.note) {
        setErrors((e) => ({ ...e, [key]: res.status === 401 ? "AI notes need the internal key in production (until Phase 5 sign-in)." : (body.error ?? `Request failed (${res.status})`) }));
      } else {
        setNotes((n) => ({ ...n, [key]: body.note! }));
      }
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Request failed" }));
    } finally {
      setBusy(null);
    }
  }

  async function exportBrief(format: "md" | "docx") {
    setExporting(format);
    setExportError(null);
    try {
      const res = await fetch("/api/briefs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: brief.source, format, notes }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `brief.${format}`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const slot = (k: string, label: string) => (
    <NoteSlot note={notes[k]} label={label} busy={busy} me={k} error={errors[k]} cites={cites} onWrite={() => writeNote(k)} />
  );

  const titleLen = brief.listing.etsyTitle.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{brief.format}</Badge>
            <Badge variant="outline">{brief.source.kind === "opportunity" ? "Deep-run opportunity" : "Validated quick idea"}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{brief.title}</h1>
          <p className="text-xs text-muted-foreground">
            Fact lines cite stored evidence. Suggestions follow fixed rules from cited facts. AI interpretation is written on request by a language model from the cited lines: check it.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" className="cursor-pointer" disabled={exporting !== null} onClick={() => exportBrief("md")}>
            {exporting === "md" ? <Loader2 className="animate-spin" /> : <Download />}
            Markdown
          </Button>
          <Button size="sm" className="cursor-pointer" disabled={exporting !== null} onClick={() => exportBrief("docx")}>
            {exporting === "docx" ? <Loader2 className="animate-spin" /> : <FileText />}
            DOCX
          </Button>
        </div>
      </div>
      {exportError && <p className="text-xs text-rose-600 dark:text-rose-400">{exportError}</p>}

      {brief.verdict && <VerdictPanel verdict={brief.verdict} compact />}
      {brief.adviceNote && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>{brief.adviceNote}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Promise">
          <FactLine fact={brief.promise} />
        </Section>
        <Section title="Audience">{brief.audience ? <FactLine fact={brief.audience} /> : <Empty>Not observed in stored signals.</Empty>}</Section>
      </div>

      <Section title="Outline" hint="Headings come from this topic's observed searches; standard headings for the format fill the rest. Section notes are AI, on request.">
        <ol className="space-y-3">
          {brief.outline.map((s, i) => (
            <li key={s.heading} className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{s.heading}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <LayerTag layer="suggestion" />
                    {s.fromPhrase ? `from the search "${s.fromPhrase}"` : "standard heading for this format"}
                  </div>
                  {slot(s.heading, "Write section notes")}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Buyer language" hint="Verbatim from stored signals and searches.">
        {brief.buyerLanguage.length ? brief.buyerLanguage.map((q, i) => <FactLine key={i} fact={q} quote />) : <Empty>None observed.</Empty>}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Where to sell">
          {brief.whereToSell ? (
            <>
              <FactLine fact={brief.whereToSell.fact} />
              <ul className="space-y-1 text-xs text-muted-foreground">
                {brief.whereToSell.marketplaces.map((m) => (
                  <li key={m.platform}>
                    {m.label}: {m.listings} listings, {m.withReviews} showing reviews ({m.reviews} reviews)
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">Listing and review counts only. Not sales or revenue.</p>
            </>
          ) : (
            <Empty>{brief.source.kind === "idea" ? "Not observed: run a competition check on the idea card first." : "No competitors stored for this market."}</Empty>
          )}
        </Section>
        <Section title="Price anchor">{brief.priceAnchor ? <FactLine fact={brief.priceAnchor} /> : <Empty>No priced listing observed.</Empty>}</Section>
      </div>

      <Section title="Keywords" hint="Observed search phrases, closest to the main phrase first.">
        <div className="flex flex-wrap gap-1.5">
          {brief.keywords.map((k) => (
            <span key={k.text} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
              {k.text}
              {k.cites[0]?.url && (
                <a href={k.cites[0].url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title={`Source: ${k.cites[0].source}`}>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Listing copy">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Etsy title</p>
            <span className="font-mono text-[11px] text-muted-foreground">
              {titleLen}/{ETSY_TITLE_MAX}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <LayerTag layer="suggestion" />
            <p className="min-w-0 flex-1 text-sm">{brief.listing.etsyTitle}</p>
            <Button
              size="icon-xs"
              variant="ghost"
              className="cursor-pointer"
              title="Copy title"
              // Denied clipboard permission is not worth an error; the title stays on screen.
              onClick={() => navigator.clipboard?.writeText(brief.listing.etsyTitle).catch(() => undefined)}
            >
              <Copy />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Etsy tags</p>
            <span className="font-mono text-[11px] text-muted-foreground">
              {brief.listing.etsyTags.length}/{ETSY_TAGS_MAX}, ≤ 20 characters each
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {brief.listing.etsyTags.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Description (Gumroad / Etsy)</p>
          {slot(DESCRIPTION_KEY, "Draft description from buyer language")}
        </div>
      </Section>

      <Section title="Bonus angles" hint="Add-ons from related searches and observed gaps.">
        {brief.bonusAngles.length ? (
          brief.bonusAngles.map((b, i) => (
            <div key={i} className="flex items-start gap-2">
              <LayerTag layer="suggestion" />
              <p className="min-w-0 text-sm">
                {b.text}
                <Cites cites={b.cites} />
              </p>
            </div>
          ))
        ) : (
          <Empty>None observed.</Empty>
        )}
      </Section>
    </div>
  );
}
