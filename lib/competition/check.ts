// lib/competition/check.ts — on-demand competition check per quick idea (Phase 3 Part 3.9, DEC-010).
// One click runs the Etsy / Gumroad / KDP adapters (DEC-007) for the idea's phrase through the
// ingest pipeline, then stores every listing as `competition` evidence under one id per phrase.
// A marketplace that answered with nothing gets a "0 listings" row, so "none observed" is stored
// too. The card's numbers are always read back from those rows, never from memory: raw listing,
// review and price counts only, no revenue estimate (QC Rule 3). Nothing here runs on a scan.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runIngest, type IngestDeps, type IngestSourceStatus } from "../ingest/pipeline.ts";
import type { MarketSignal } from "../sources/types.ts";

/** Adapter keys a check runs. Only the check route may pass these to runIngest (Serper credits). */
export const CHECK_SOURCES = ["etsy", "gumroad", "kdp"] as const;
const LABEL: Record<string, string> = { etsy: "Etsy", gumroad: "Gumroad", kdp: "Amazon KDP" };
export const CHECK_LIMIT = 10;

export interface Listing {
  platform: string;
  url: string;
  price: string | null;
  reviews: number | null;
}

export interface MarketplaceCount {
  platform: string;
  label: string;
  listings: number;
  withReviews: number;
  reviews: number;
  priceMin: number | null;
  priceMax: number | null;
  /** Currency symbol when every priced listing shares one, else null (mixed or none). */
  currency: string | null;
}

export interface CompetitionCheck {
  phrase: string;
  checkedAt: string;
  listings: number;
  marketplaces: MarketplaceCount[];
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable uuid-shaped `evidence.entity_id` for a phrase, so a later scan finds the check. */
export function checkEntityId(phrase: string): string {
  const h = createHash("sha256").update(`idea-competition:${normalizePhrase(phrase)}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function parsePriceText(price: string | null): { value: number; currency: string | null } | null {
  if (!price) return null;
  if (/^free$/i.test(price.trim())) return { value: 0, currency: null };
  const m = price.match(/([$£€])?\s*(\d+(?:\.\d+)?)/);
  return m ? { value: Number(m[2]), currency: m[1] ?? null } : null;
}

/** Per-marketplace counts. `platforms` lists every marketplace that answered, even with 0 rows. */
export function summarizeListings(platforms: string[], listings: Listing[]): MarketplaceCount[] {
  return platforms.map((platform) => {
    const rows = listings.filter((l) => l.platform === platform);
    const prices = rows.map((l) => parsePriceText(l.price)).filter((p) => p !== null);
    const symbols = new Set(prices.filter((p) => p.value > 0).map((p) => p.currency));
    const reviewed = rows.filter((l) => l.reviews !== null);
    return {
      platform,
      label: LABEL[platform] ?? platform,
      listings: rows.length,
      withReviews: reviewed.length,
      reviews: reviewed.reduce((a, l) => a + (l.reviews ?? 0), 0),
      priceMin: prices.length ? Math.min(...prices.map((p) => p.value)) : null,
      priceMax: prices.length ? Math.max(...prices.map((p) => p.value)) : null,
      currency: symbols.size === 1 ? [...symbols][0] : null,
    };
  });
}

export interface EvidenceDraft {
  entity_type: "competition";
  entity_id: string;
  source_id: string | null;
  claim: string;
  excerpt: string | null;
  url: string | null;
}

export interface CheckDeps extends IngestDeps {
  /** Insert the new rows, then drop the entity's older rows (a re-check replaces the last one). */
  replaceEvidence: (entityId: string, rows: EvidenceDraft[]) => Promise<void>;
}

export interface CheckRunResult {
  entityId: string;
  sources: { key: string; status: IngestSourceStatus; collected: number; error?: string }[];
}

export async function runCompetitionCheck(phrase: string, deps: CheckDeps): Promise<CheckRunResult> {
  const text = normalizePhrase(phrase);
  if (!text) throw new Error("competition check requires a phrase");
  const found = new Map<string, MarketSignal[]>();
  const summary = await runIngest({ query: text, limit: CHECK_LIMIT, sourceKeys: [...CHECK_SOURCES] }, deps, (key, signals) =>
    found.set(key, signals),
  );
  const entityId = checkEntityId(text);
  const rows: EvidenceDraft[] = [];
  for (const s of summary.sources) {
    if (s.status !== "ok") continue;
    const sourceId = await deps.resolveSourceId(s.key);
    const label = LABEL[s.key] ?? s.key;
    const listings = (found.get(s.key) ?? []).filter((l) => l.url);
    if (listings.length === 0) {
      rows.push({ entity_type: "competition", entity_id: entityId, source_id: sourceId, claim: `0 ${label} listings observed for "${text}"`, excerpt: null, url: null });
    }
    for (const l of listings) {
      rows.push({ entity_type: "competition", entity_id: entityId, source_id: sourceId, claim: `${label} listing observed for "${text}"`, excerpt: l.text, url: l.url });
    }
  }
  // Every marketplace skipped or failed: keep the previous check rather than store an empty one.
  if (rows.length > 0) await deps.replaceEvidence(entityId, rows);
  return {
    entityId,
    sources: summary.sources.map(({ key, status, collected, error }) => ({ key, status, collected, ...(error ? { error } : {}) })),
  };
}

interface EvidenceRead {
  id: string;
  entity_id: string;
  claim: string;
  excerpt: string | null;
  url: string | null;
  created_at: string;
  sources: { type?: string } | { type?: string }[] | null;
}
interface SignalRead {
  external_id: string;
  engagement: { price?: string | null; review_count?: number | null } | null;
  sources: { type?: string } | { type?: string }[] | null;
}
export function batchByLength(items: string[], maxChars: number): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const it of items) {
    const n = encodeURIComponent(it).length + 3;
    if (cur.length && len + n > maxChars) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

const typeOf = (s: EvidenceRead["sources"]) => (Array.isArray(s) ? s[0]?.type : s?.type) ?? "unknown";

export interface StoredListing extends Listing {
  evidenceId: string;
  excerpt: string | null;
}

export interface StoredCheck {
  phrase: string;
  checkedAt: string;
  /** Marketplaces that answered, in CHECK_SOURCES order, with the ids of their "0 listings" rows. */
  platforms: string[];
  zeroRows: { platform: string; evidenceId: string; claim: string }[];
  listings: StoredListing[];
}

/** Stored check rows per phrase, listing by listing, keyed by normalized phrase. DB reads only. */
export async function loadStoredChecks(supabase: SupabaseClient, phrases: string[]): Promise<Record<string, StoredCheck>> {
  const byId = new Map(phrases.map((p) => [checkEntityId(p), normalizePhrase(p)]));
  if (byId.size === 0) return {};
  const { data: ev, error } = await supabase
    .from("evidence")
    .select("id, entity_id, claim, excerpt, url, created_at, sources ( type )")
    .eq("entity_type", "competition")
    .in("entity_id", [...byId.keys()]);
  if (error) throw new Error(`failed to load competition checks: ${error.message}`);
  const evidence = (ev ?? []) as EvidenceRead[];
  if (evidence.length === 0) return {};

  const urls = [...new Set(evidence.map((e) => e.url).filter((u): u is string => !!u))];
  const signals = new Map<string, SignalRead>();
  // Listing signals use the listing url as external_id (marketplace adapters). The filter goes in the
  // GET query string and Google redirect urls run to ~400 chars, so batch by length, not count.
  for (const batch of batchByLength(urls, 4000)) {
    const { data, error: sErr } = await supabase
      .from("signals")
      .select("external_id, engagement, sources ( type )")
      .in("external_id", batch);
    if (sErr) throw new Error(`failed to load competition listings: ${sErr.message}`);
    for (const r of (data ?? []) as SignalRead[]) signals.set(`${typeOf(r.sources)}|${r.external_id}`, r);
  }

  const out: Record<string, StoredCheck> = {};
  for (const [id, phrase] of byId) {
    const rows = evidence.filter((e) => e.entity_id === id);
    if (rows.length === 0) continue;
    const platforms = [...new Set(rows.map((r) => typeOf(r.sources)))].sort(
      (a, b) => CHECK_SOURCES.indexOf(a as never) - CHECK_SOURCES.indexOf(b as never),
    );
    out[phrase] = {
      phrase,
      checkedAt: rows.map((r) => r.created_at).sort().at(-1) as string,
      platforms,
      zeroRows: rows.filter((r) => !r.url).map((r) => ({ platform: typeOf(r.sources), evidenceId: r.id, claim: r.claim })),
      listings: rows
        .filter((r) => r.url)
        .map((r) => {
          const platform = typeOf(r.sources);
          const eng = signals.get(`${platform}|${r.url}`)?.engagement ?? null;
          return {
            platform,
            url: r.url as string,
            price: eng?.price ?? null,
            reviews: eng?.review_count ?? null,
            evidenceId: r.id,
            excerpt: r.excerpt,
          };
        }),
    };
  }
  return out;
}

/** Stored checks for these phrases, keyed by normalized phrase. DB reads only, no adapter call. */
export async function loadCompetitionChecks(supabase: SupabaseClient, phrases: string[]): Promise<Record<string, CompetitionCheck>> {
  const stored = await loadStoredChecks(supabase, phrases);
  const out: Record<string, CompetitionCheck> = {};
  for (const [phrase, c] of Object.entries(stored)) {
    out[phrase] = {
      phrase,
      checkedAt: c.checkedAt,
      listings: c.listings.length,
      marketplaces: summarizeListings(
        c.platforms,
        c.listings.map(({ platform, url, price, reviews }) => ({ platform, url, price, reviews })),
      ),
    };
  }
  return out;
}
