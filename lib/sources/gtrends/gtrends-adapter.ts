// lib/sources/gtrends/gtrends-adapter.ts — Tier-1 Google Trends adapter.
// Spec: docs/08-ADAPTERS.md + docs/guides/sources-reddit-trends-search.md.
//
// ⚠️ UNOFFICIAL API TERRITORY. There is no official Google Trends API; this
// adapter sits on the community `google-trends-api` client (pinned exact in
// package.json; verified live 2026-09-17). Per the guide it is ISOLATED to
// this module (the package is never imported elsewhere), CACHED ≥24h, and
// DEGRADES gracefully: any upstream breakage throws a descriptive error that
// the ingest pipeline turns into honest per-source counts — never fake data.
// Breakage follows the decision-request path (01-PHILOSOPHY §4a), not a hack.
//
// What it collects (MVP = ONE 90-day window; 7d/30d/90d+12m multi-window
// trend math is deferred to Part 1.4 where the scoring actually needs it):
//   1. interest-over-time → ONE summary signal (avg/max/min + direction).
//   2. related queries (top + rising) → ONE signal each, up to the limit.
// No authors exist here; `author` is always 'anonymous'. No raw usernames
// anywhere (06-EVIDENCE-CONTRACT).

import { createHash } from "node:crypto";
import googleTrends from "google-trends-api";
import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "../types.ts";

export const GTRENDS_KEY = "gtrends";
export const GTRENDS_GEO_DEFAULT = ""; // "" = worldwide
export const GTRENDS_WINDOW_DAYS = 90;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // ≥24h per guide
export const MIN_INTERVAL_MS = 5000; // conservative: unofficial API, no quota docs
const MAX_LIMIT = 25;

/** Raw payload shapes produced by this adapter (see collect/normalize). */
export interface InterestOverTimePayload {
  kind: "interest_over_time";
  keyword: string;
  geo: string;
  windowDays: number;
  startTime: string;
  endTime: string;
  points: Array<{ time: string; value: number }>;
  average: number;
  max: number;
  min: number;
}

export interface RelatedQueryPayload {
  kind: "related_query";
  keyword: string;
  related: string;
  value: number;
  rising: boolean;
  geo: string;
  fetchedWindowDays: number;
}

export type GTrendsPayload = InterestOverTimePayload | RelatedQueryPayload;

/** Sealed upstream surface — the ONLY place the unofficial client is touched. */
export interface TrendsBackend {
  interestOverTime(opts: {
    keyword: string;
    startTime: Date;
    endTime: Date;
    geo?: string;
  }): Promise<string>;
  relatedQueries(opts: {
    keyword: string;
    startTime: Date;
    endTime: Date;
    geo?: string;
  }): Promise<string>;
  autoComplete(opts: { keyword: string }): Promise<string>;
}

const liveBackend: TrendsBackend = {
  interestOverTime: (opts) => googleTrends.interestOverTime(opts),
  relatedQueries: (opts) => googleTrends.relatedQueries(opts),
  autoComplete: (opts) => googleTrends.autoComplete(opts),
};

export interface GTrendsAdapterConfig {
  geo: string;
  windowDays: number;
  minIntervalMs: number;
  cacheTtlMs: number;
  backend: TrendsBackend;
  nowFn: () => number;
}

export function gtrendsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GTrendsAdapterConfig {
  return {
    geo: env.GTRENDS_GEO ?? GTRENDS_GEO_DEFAULT,
    windowDays: GTRENDS_WINDOW_DAYS,
    minIntervalMs: MIN_INTERVAL_MS,
    cacheTtlMs: CACHE_TTL_MS,
    backend: liveBackend,
    nowFn: Date.now,
  };
}

interface CachedCollect {
  at: number;
  items: RawSignal[];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

function exploreUrl(keyword: string): string {
  return `https://trends.google.com/trends/explore?date=today%203-m&q=${encodeURIComponent(keyword)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TimelinePoint {
  time?: string;
  formattedTime?: string;
  value?: number[];
}

interface RankedKeyword {
  query?: string;
  value?: number;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export class GTrendsAdapter implements SourceAdapter {
  readonly key = GTRENDS_KEY;
  readonly displayName = "Google Trends";
  readonly tiers: 1 | 2 | 3 = 1;

  private lastRequestAt = 0;
  private cache = new Map<string, CachedCollect>();
  private readonly config: GTrendsAdapterConfig;

  constructor(config: GTrendsAdapterConfig) {
    this.config = config;
  }

  private async throttle(): Promise<void> {
    const elapsed = this.config.nowFn() - this.lastRequestAt;
    const wait = this.config.minIntervalMs - elapsed;
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = this.config.nowFn();
  }

  private async callBackend<T>(label: string, fn: () => Promise<T>): Promise<T> {
    await this.throttle();
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Google Trends ${label} failed: ${message} (unofficial API — ` +
          `transient breakage possible; persistent failure is a decision request, not a hack)`,
      );
    }
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    const query = input.query.trim();
    if (!query) throw new Error("Google Trends collect requires a non-empty query");
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit) || 10));
    // `since` has no per-item meaning for trend windows (interest points carry
    // their own timestamps; related queries carry none) — accepted, unused.
    const cacheKey = `${query}|${limit}|${this.config.geo}|${this.config.windowDays}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.config.nowFn() - cached.at < this.config.cacheTtlMs) {
      return cached.items;
    }

    const endTime = new Date(this.config.nowFn());
    const startTime = new Date(
      endTime.getTime() - this.config.windowDays * 86400_000,
    );
    const geoOpt = this.config.geo ? { geo: this.config.geo } : {};

    const iotRaw = await this.callBackend("interestOverTime", () =>
      this.config.backend.interestOverTime({
        keyword: query,
        startTime,
        endTime,
        ...geoOpt,
      }),
    );
    const rqRaw = await this.callBackend("relatedQueries", () =>
      this.config.backend.relatedQueries({
        keyword: query,
        startTime,
        endTime,
        ...geoOpt,
      }),
    );

    const items: RawSignal[] = [];
    const fetchedAt = new Date(this.config.nowFn()).toISOString();

    const iot = JSON.parse(iotRaw) as {
      default?: { timelineData?: TimelinePoint[] };
    };
    const points = (iot?.default?.timelineData ?? [])
      .map((p) => ({
        time: p.formattedTime ?? String(p.time ?? ""),
        value: toNumber(p.value?.[0]),
      }))
      .filter((p) => p.time.length > 0);
    const values = points.map((p) => p.value);
    const average =
      values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : 0;
    const interest: InterestOverTimePayload = {
      kind: "interest_over_time",
      keyword: query,
      geo: this.config.geo,
      windowDays: this.config.windowDays,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      points,
      average,
      max: values.length > 0 ? Math.max(...values) : 0,
      min: values.length > 0 ? Math.min(...values) : 0,
    };
    items.push({
      source: GTRENDS_KEY,
      externalId: `gtrends:iot:${this.config.geo || "world"}:${slug(query)}:${this.config.windowDays}d`,
      fetchedAt,
      payload: interest,
    });

    const rq = JSON.parse(rqRaw) as {
      default?: {
        rankedList?: Array<{ rankedKeyword?: RankedKeyword[] }>;
      };
    };
    const lists = rq?.default?.rankedList ?? [];
    const seen = new Set<string>([query.toLowerCase()]);
    // Rising queries get up to half the related slots; otherwise a full top list crowds them out (Part 3.6).
    const slots = limit - items.length;
    const topQuota = slots - Math.min(lists[1]?.rankedKeyword?.length ?? 0, Math.floor(slots / 2));
    // rankedList[0] = top, [1] = rising (when present).
    lists.forEach((list, listIndex) => {
      for (const entry of list?.rankedKeyword ?? []) {
        if (items.length >= limit || (listIndex === 0 && items.length - 1 >= topQuota)) break;
        const related = (entry.query ?? "").trim();
        if (!related || seen.has(related.toLowerCase())) continue;
        seen.add(related.toLowerCase());
        const payload: RelatedQueryPayload = {
          kind: "related_query",
          keyword: query,
          related,
          value: toNumber(entry.value),
          rising: listIndex === 1,
          geo: this.config.geo,
          fetchedWindowDays: this.config.windowDays,
        };
        items.push({
          source: GTRENDS_KEY,
          externalId: `gtrends:rq:${this.config.geo || "world"}:${shortHash(`${query.toLowerCase()}|${related.toLowerCase()}`)}`,
          fetchedAt,
          payload,
        });
      }
    });

    this.cache.set(cacheKey, { at: this.config.nowFn(), items });
    return items;
  }

  normalize(raw: RawSignal): MarketSignal {
    const data = raw.payload as GTrendsPayload | null | undefined;
    if (!data || typeof data !== "object" || !("kind" in data)) {
      throw new Error("Google Trends normalize requires a trends payload object");
    }
    if (data.kind === "interest_over_time") {
      const half = Math.floor(data.points.length / 2);
      const first = data.points.slice(0, half);
      const second = data.points.slice(half);
      const avg = (ps: Array<{ value: number }>) =>
        ps.length > 0 ? ps.reduce((a, b) => a + b.value, 0) / ps.length : 0;
      // Guard: single data point produces empty first slice → "flat" not false "rising" (M-3)
      const direction = first.length === 0
        ? "flat" as const
        : avg(second) > avg(first) + 5
          ? "rising"
          : avg(second) < avg(first) - 5
            ? "falling"
            : "flat";
      const engagement: SignalEngagement = {
        seed: data.keyword,
        avg_interest: data.average,
        max_interest: data.max,
        min_interest: data.min,
        direction,
        points: data.points.length,
        window_days: data.windowDays,
      };
      return {
        source: GTRENDS_KEY,
        source_id: raw.externalId,
        url: exploreUrl(data.keyword),
        title: `"${data.keyword}" search interest — ${data.windowDays}-day average ${data.average}/100 (${direction})`,
        text:
          `Google Trends observed ${data.points.length} interest points for ` +
          `"${data.keyword}" over ${data.windowDays} days: average ${data.average}/100, ` +
          `peak ${data.max}/100, low ${data.min}/100, second-half direction ${direction}.`,
        author: "anonymous",
        timestamp: data.endTime,
        engagement,
        market_candidates: [],
        intent: null,
        pain_points: [],
      };
    }
    const engagement: SignalEngagement = {
      seed: data.keyword,
      related_query: data.related,
      interest_value: data.value,
      rising: data.rising,
      window_days: data.fetchedWindowDays,
    };
    return {
      source: GTRENDS_KEY,
      source_id: raw.externalId,
      url: exploreUrl(data.related),
      title: `Related query: "${data.related}" (linked to "${data.keyword}")`,
      text:
        `Google Trends lists "${data.related}" as a ${data.rising ? "rising" : "top"} ` +
        `related query for "${data.keyword}" with interest value ${data.value}/100.`,
      author: "anonymous",
      timestamp: new Date(this.config.nowFn()).toISOString(),
      engagement,
      market_candidates: [],
      intent: null,
      pain_points: [],
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = this.config.nowFn();
    try {
      // autoComplete is the cheapest upstream call (no widget handshake).
      await this.callBackend("health probe (autoComplete)", () =>
        this.config.backend.autoComplete({ keyword: "test" }),
      );
      const ms = this.config.nowFn() - started;
      return {
        ok: true,
        detail: `unofficial-api ok in ${ms}ms (geo=${this.config.geo || "world"}, cache_ttl_h=${Math.round(this.config.cacheTtlMs / 3600000)})`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `google trends unreachable: ${message}` };
    }
  }
}
