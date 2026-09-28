// lib/sources/etsy/etsy-adapter.ts — Tier-2 marketplace adapter for Etsy.
// Spec: docs/08-ADAPTERS.md, DEC-007 (web-search-backed targeted search, ToS-clean).

import { createHash } from "node:crypto";
import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SourceAdapter,
} from "../types.ts";
import { SourceNotConfiguredError } from "../types.ts";
import { parseMarketplaceProduct } from "../marketplace-helper.ts";
import type { CompetitorProduct } from "../../competition/types.ts";

export const ETSY_KEY = "etsy";
export const SERPER_ENDPOINT = "https://google.serper.dev/search";
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
export const MIN_INTERVAL_MS = 1000;
const MAX_LIMIT = 20;

export interface EtsyOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  position?: number;
}

export interface EtsyAdapterConfig {
  apiKey?: string;
  cacheTtlMs?: number;
  minIntervalMs?: number;
  fetchFn?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  nowFn?: () => number;
}

export function etsyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EtsyAdapterConfig {
  const apiKey = env.SERPER_API_KEY || undefined;
  return {
    apiKey,
    cacheTtlMs: CACHE_TTL_MS,
    minIntervalMs: MIN_INTERVAL_MS,
    fetchFn: fetch,
    nowFn: Date.now,
  };
}

function missingKeyError(): SourceNotConfiguredError {
  return new SourceNotConfiguredError(
    "Etsy marketplace search is not configured: set SERPER_API_KEY (see DEC-002 / DEC-007). " +
      "Runs continue without this source and the completeness panel says so.",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class EtsyAdapter implements SourceAdapter {
  readonly key = ETSY_KEY;
  readonly displayName = "Etsy";
  readonly tiers: 1 | 2 | 3 = 2;

  private lastRequestAt = 0;
  private cache = new Map<string, { at: number; items: RawSignal[] }>();
  private readonly config: Required<EtsyAdapterConfig>;

  constructor(config: EtsyAdapterConfig = {}) {
    this.config = {
      apiKey: config.apiKey || "",
      cacheTtlMs: config.cacheTtlMs ?? CACHE_TTL_MS,
      minIntervalMs: config.minIntervalMs ?? MIN_INTERVAL_MS,
      fetchFn: config.fetchFn || fetch,
      nowFn: config.nowFn || Date.now,
    };
  }

  get isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private async throttle(): Promise<void> {
    const elapsed = this.config.nowFn() - this.lastRequestAt;
    const wait = this.config.minIntervalMs - elapsed;
    if (wait > 0) await sleep(wait);
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    if (!this.config.apiKey) throw missingKeyError();
    const query = input.query.trim();
    if (!query) throw new Error("Etsy collect requires a non-empty query");
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit) || 10));

    const cacheKey = `${query}|${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.config.nowFn() - cached.at < this.config.cacheTtlMs) {
      return cached.items;
    }

    await this.throttle();
    const searchQuery = `site:etsy.com ${query} (pdf OR printable OR "digital download")`;

    let res: Response;
    try {
      res = await this.config.fetchFn(SERPER_ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-KEY": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: searchQuery, num: limit }),
      });
    } catch (err) {
      throw new Error(`Etsy search request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.lastRequestAt = this.config.nowFn();
    if (!res.ok) {
      throw new Error(`Etsy search request failed: HTTP ${res.status} from Serper`);
    }

    const body = (await res.json()) as { organic?: EtsyOrganicResult[] };
    const organic = Array.isArray(body.organic) ? body.organic : [];

    const items: RawSignal[] = [];
    const seen = new Set<string>();
    for (const result of organic) {
      let link = (result.link ?? "").trim();
      // Strip tracking query params to prevent duplicate signals (H-2)
      try { const u = new URL(link); u.search = ""; u.hash = ""; link = u.toString(); } catch {}
      if (!link || seen.has(link)) continue;
      seen.add(link);

      items.push({
        source: ETSY_KEY,
        externalId: link,
        fetchedAt: new Date(this.config.nowFn()).toISOString(),
        payload: {
          title: result.title ?? "",
          link,
          snippet: result.snippet ?? "",
          date: result.date ?? "",
          position: result.position ?? items.length + 1,
        } satisfies EtsyOrganicResult,
      });

      if (items.length >= limit) break;
    }

    this.cache.set(cacheKey, { at: this.config.nowFn(), items });
    return items;
  }

  normalize(raw: RawSignal): MarketSignal {
    const payload = (raw.payload ?? {}) as EtsyOrganicResult;
    const parsed = parseMarketplaceProduct("etsy", {
      title: payload.title,
      link: payload.link,
      snippet: payload.snippet,
    });

    return {
      source: ETSY_KEY,
      source_id: raw.externalId,
      url: payload.link || null,
      title: parsed.title,
      text: payload.snippet || null,
      author: parsed.seller
        ? `sha256:${createHash("sha256").update(parsed.seller).digest("hex").slice(0, 16)}`
        : "anonymous",
      timestamp: null,
      engagement: {
        price: parsed.price,
        rating: parsed.rating,
        review_count: parsed.reviewCount,
        format: parsed.format,
        positioning: parsed.positioning,
      },
      market_candidates: [],
      intent: "strong", // Marketplace listings directly evidence commercial buyer intent
      pain_points: parsed.promises || [],
    };
  }

  extractCompetitors(items: RawSignal[]): CompetitorProduct[] {
    return items.map((item) => {
      const p = (item.payload ?? {}) as EtsyOrganicResult;
      return parseMarketplaceProduct("etsy", {
        title: p.title,
        link: p.link,
        snippet: p.snippet,
      });
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.config.apiKey) {
      return {
        ok: false,
        detail: "Etsy adapter not configured: SERPER_API_KEY is not set in environment (DEC-002/DEC-007)",
      };
    }
    return {
      ok: true,
      detail: "Etsy adapter configured via Serper web search (Tier-2)",
    };
  }
}
