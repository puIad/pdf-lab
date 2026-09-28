// lib/sources/web/web-adapter.ts — Tier-1 web-search adapter (Serper).
// Spec: docs/08-ADAPTERS.md + docs/guides/sources-reddit-trends-search.md,
// provider pick logged in DEC-002 (Serper: 2,500 free credits, no card,
// ~$1/1K → ~$0.30/1K; shape = raw Google SERP with URL+title+snippet+date).
//
// Contract: exactly ONE provider behind the `web` key. No SERPER_API_KEY →
// collect() throws SourceNotConfiguredError and healthCheck() reports
// ok:false; the ingest pipeline turns that into an honest `skipped` source
// (PRD §55 completeness), never filler. No raw usernames exist in SERP data;
// `author` is always 'anonymous' (06-EVIDENCE-CONTRACT).

import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "../types.ts";
import { SourceNotConfiguredError } from "../types.ts";

export const WEB_KEY = "web";
export const SERPER_ENDPOINT = "https://google.serper.dev/search";
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1h: SERPs drift, but reruns shouldn't rebill
export const MIN_INTERVAL_MS = 1000;
const MAX_LIMIT = 20; // Serper `num` caps at 20 per call

/** One organic result as returned by Serper (`organic[]`). */
export interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  position?: number;
}

export interface WebAdapterConfig {
  apiKey?: string;
  cacheTtlMs: number;
  minIntervalMs: number;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  nowFn: () => number;
}

export function webConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WebAdapterConfig {
  const apiKey = env.SERPER_API_KEY || undefined;
  return {
    apiKey,
    cacheTtlMs: CACHE_TTL_MS,
    minIntervalMs: MIN_INTERVAL_MS,
    fetchFn: fetch,
    nowFn: Date.now,
  };
}

interface CachedSearch {
  at: number;
  items: RawSignal[];
}

function missingKeyError(): SourceNotConfiguredError {
  return new SourceNotConfiguredError(
    "Web search is not configured: set SERPER_API_KEY (free tier: 2,500 credits, " +
      "no credit card — https://serper.dev, see DEC-002). Runs continue without " +
      "this source and the completeness panel says so.",
  );
}

/** Best-effort ISO parse of Serper's `date` ("Aug 12, 2026" parses; "3 days ago" → null). */
export function parseResultDate(date: string | undefined): string | null {
  if (!date) return null;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebAdapter implements SourceAdapter {
  readonly key = WEB_KEY;
  readonly displayName = "Web search";
  readonly tiers: 1 | 2 | 3 = 1;

  private lastRequestAt = 0;
  private cache = new Map<string, CachedSearch>();
  private readonly config: WebAdapterConfig;

  constructor(config: WebAdapterConfig) {
    this.config = config;
  }

  /** True when a Serper key is configured (prod path). */
  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private async throttle(): Promise<void> {
    const now = this.config.nowFn();
    const wait = Math.max(0, this.config.minIntervalMs - (now - this.lastRequestAt));
    this.lastRequestAt = now + wait; // Claim the slot immediately
    if (wait > 0) await sleep(wait);
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    if (!this.config.apiKey) throw missingKeyError();
    const query = input.query.trim();
    if (!query) throw new Error("Web search collect requires a non-empty query");
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit) || 10));

    const cacheKey = `${query}|${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.config.nowFn() - cached.at < this.config.cacheTtlMs) {
      return cached.items;
    }

    await this.throttle();
    let res: Response;
    try {
      res = await this.config.fetchFn(SERPER_ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-KEY": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: limit }),
      });
    } catch (err) {
      throw new Error(
        `Web search request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.lastRequestAt = this.config.nowFn();
    if (!res.ok) {
      throw new Error(`Web search request failed: HTTP ${res.status} from Serper`);
    }
    const body = (await res.json()) as { organic?: SerperOrganicResult[] };
    const organic = Array.isArray(body.organic) ? body.organic : [];

    const items: RawSignal[] = [];
    const seen = new Set<string>();
    for (const result of organic) {
      // No link = no stable external id and no evidence URL → unusable, drop.
      const link = (result.link ?? "").trim();
      if (!link || seen.has(link)) continue;
      seen.add(link);
      items.push({
        source: WEB_KEY,
        externalId: link,
        fetchedAt: new Date(this.config.nowFn()).toISOString(),
        payload: {
          title: result.title ?? "",
          link,
          snippet: result.snippet ?? "",
          date: result.date ?? "",
          position: result.position ?? items.length + 1,
        } satisfies SerperOrganicResult,
      });
      if (items.length >= limit) break;
    }

    this.cache.set(cacheKey, { at: this.config.nowFn(), items });
    return items;
  }

  normalize(raw: RawSignal): MarketSignal {
    const data = raw.payload as SerperOrganicResult | null | undefined;
    if (!data || typeof data !== "object") {
      throw new Error("Web search normalize requires a Serper result payload object");
    }
    const url = (data.link ?? "").trim() || null;
    const title = (data.title ?? "").trim() || null;
    const snippet = (data.snippet ?? "").trim() || null;
    const engagement: SignalEngagement = {
      position: typeof data.position === "number" ? data.position : 0,
      ...(data.date ? { result_date: data.date } : {}),
    };
    return {
      source: WEB_KEY,
      source_id: raw.externalId,
      url,
      title,
      text: snippet,
      author: "anonymous",
      timestamp: parseResultDate(data.date),
      engagement,
      market_candidates: [],
      intent: null,
      pain_points: [],
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.config.apiKey) {
      return { ok: false, detail: missingKeyError().message };
    }
    const started = this.config.nowFn();
    try {
      const items = await this.collect({ query: "test", limit: 1 });
      const ms = this.config.nowFn() - started;
      return { ok: true, detail: `serper ok in ${ms}ms, probe_items=${items.length}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `web search unreachable: ${message}` };
    }
  }
}
