// components/brief/brief-page.tsx — server wrapper shared by both brief pages: loads the brief from
// stored rows, or explains why there is none (no evidence, not scanned, Validate said KILL).

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { BriefUnavailable, loadBrief, type Brief, type BriefSource } from "@/lib/brief";
import { BriefView } from "./brief-view";

export async function BriefPage({ source, back }: { source: BriefSource; back: { href: string; label: string } }) {
  let brief: Brief | null = null;
  let unavailable: string | null = null;
  try {
    brief = await loadBrief(createServiceSupabaseClient(), source);
  } catch (err) {
    if (!(err instanceof BriefUnavailable)) throw err;
    unavailable = err.message;
  }
  const content = brief ? (
    <BriefView brief={brief} />
  ) : (
    <div className="space-y-3 rounded-lg border border-border p-5">
      <h1 className="text-lg font-semibold">No brief for this {source.kind === "idea" ? "idea" : "opportunity"}</h1>
      <p className="text-sm text-muted-foreground">{unavailable}</p>
      {source.kind === "idea" && (
        <Link href={`/ideas?q=${encodeURIComponent(source.seed)}`} className="text-sm underline underline-offset-2">
          Back to the ideas for “{source.seed}”: validate first
        </Link>
      )}
    </div>
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="container mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link href={back.href} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            {back.label}
          </Link>
          <span className="text-border">/</span>
          <span className="text-xs font-medium">Build-ready brief</span>
        </div>
      </header>
      <main className="container mx-auto max-w-4xl px-4 py-8">{content}</main>
    </div>
  );
}
