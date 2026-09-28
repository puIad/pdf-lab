// lib/sources/reddit/reddit-adapter.ts — Tier-1 Reddit adapter (read-only).
// Spec: docs/08-ADAPTERS.md + docs/guides/sources-reddit-trends-search.md.
//
// Access strategy (ToS-clean, official API only):
//  1. Preferred: app-only OAuth (client_credentials) when REDDIT_CLIENT_ID +
//     REDDIT_CLIENT_SECRET are set → https://oauth.reddit.com. Read-only,
//     higher limits, stable contract. Needs only a reddit "script"/"web" app;
//     no user password (script-username flow NOT used).
//  2. Fallback: unauthenticated public search JSON (www.reddit.com) with a
//     descriptive User-Agent. Lower limits; kept so local dev works with zero
//     credentials. healthCheck() always reports which mode is live.
//
// Privacy: `normalize()` NEVER emits a raw username. Authors become
// `sha256:<hex>` (salt via REDDIT_AUTHOR_SALT, default constant below) or
// `'anonymous'` for null/'[deleted]'/'[removed]'. The salt is not a secret —
// it only prevents trivial cross-dataset joins; disclosure does not deanonymize.
//
// Rate limits: ≥2s between requests (conservative vs Reddit's ~60/min OAuth,
// ~10/min anon), Retry-After honored, exponential backoff on 429/5xx (max 3
// attempts), short in-memory cache (5 min) so repeated queries don't burn quota.

import { createHash } from "node:crypto";
import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "../types.ts";

export const REDDIT_KEY = "reddit";
export const ANONYMOUS_AUTHOR = "anonymous";
export const DEFAULT_AUTHOR_SALT = "pdf-lab-mvp-v1";
export const DEFAULT_USER_AGENT =
  "pdf-lab/1.1 (read-only market research; contact via repo)";
export const MIN_INTERVAL_MS = 2000;
export const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_LIMIT = 100;
const MAX_ATTEMPTS = 3;

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const OAUTH_BASE = "https://oauth.reddit.com";
const PUBLIC_BASE = "https://www.reddit.com";

export interface RedditAdapterConfig {
  clientId?: string;
  clientSecret?: string;
  userAgent: string;
  authorSalt: string;
  /** Min ms between HTTP requests. Default MIN_INTERVAL_MS. */
  minIntervalMs: number;
  /** Search-result cache TTL. Default CACHE_TTL_MS. */
  cacheTtlMs: number;
  /** Fetch implementation (inject a stub in tests — no network in unit tests). */
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** Clock (injectable for tests). */
  nowFn: () => number;
}

export function redditConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RedditAdapterConfig {
  const clientId = env.REDDIT_CLIENT_ID || undefined;
  const clientSecret = env.REDDIT_CLIENT_SECRET || undefined;
  return {
    clientId,
    clientSecret,
    userAgent: env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT,
    authorSalt: env.REDDIT_AUTHOR_SALT || DEFAULT_AUTHOR_SALT,
    minIntervalMs: MIN_INTERVAL_MS,
    cacheTtlMs: CACHE_TTL_MS,
    fetchFn: fetch,
    nowFn: Date.now,
  };
}

/** Minimal shape of a Reddit listing link (`t3`) `data` object we read. */
export interface RedditPostData {
  id?: string;
  /** Fullname, e.g. `t3_abc123` — the stable external id. */
  name?: string;
  title?: string | null;
  selftext?: string | null;
  author?: string | null;
  permalink?: string | null;
  url?: string | null;
  created_utc?: number | null;
  score?: number | null;
  num_comments?: number | null;
  upvote_ratio?: number | null;
  subreddit?: string | null;
}

interface RedditListingChild {
  kind?: string;
  data?: RedditPostData;
}

interface RedditListing {
  kind?: string;
  data?: {
    children?: RedditListingChild[];
    after?: string | null;
  };
}

interface CachedSearch {
  at: number;
  items: RawSignal[];
}

interface RateSnapshot {
  used?: string;
  remaining?: string;
  resetInSeconds?: string;
}

/** `sha256:<hex>` of `salt:username`, or `'anonymous'`. Never returns input. */
export function hashRedditAuthor(
  username: string | null | undefined,
  salt: string = DEFAULT_AUTHOR_SALT,
): string {
  if (!username || username === "[deleted]" || username === "[removed]") {
    return ANONYMOUS_AUTHOR;
  }
  const hex = createHash("sha256").update(`${salt}:${username}`).digest("hex");
  return `sha256:${hex}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds, 120) * 1000;
}

export class RedditAdapter implements SourceAdapter {
  readonly key = REDDIT_KEY;
  readonly displayName = "Reddit";
  readonly tiers: 1 | 2 | 3 = 1;

  private token: { accessToken: string; expiresAt: number } | null = null;
  private lastRequestAt = 0;
  private cache = new Map<string, CachedSearch>();
  private rate: RateSnapshot = {};
  private readonly config: RedditAdapterConfig;

  constructor(config: RedditAdapterConfig) {
    this.config = config;
  }

  /** True when app-only OAuth credentials are configured (preferred mode). */
  get usesOAuth(): boolean {
    return !!(this.config.clientId && this.config.clientSecret);
  }

  private async throttle(): Promise<void> {
    const now = this.config.nowFn();
    const wait = Math.max(0, this.config.minIntervalMs - (now - this.lastRequestAt));
    this.lastRequestAt = now + wait; // Claim the slot immediately
    if (wait > 0) await sleep(wait);
  }

  private rememberRateLimit(res: Response): void {
    const used = res.headers.get("x-ratelimit-used");
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    this.rate = {
      ...(used ? { used } : {}),
      ...(remaining ? { remaining } : {}),
      ...(reset ? { resetInSeconds: reset } : {}),
    };
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    attempts: number = MAX_ATTEMPTS,
  ): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await this.throttle();
      let res: Response;
      try {
        res = await this.config.fetchFn(url, init);
      } catch (err) {
        // Network-level failure — retry with backoff.
        lastError = err instanceof Error ? err : new Error(String(err));
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      this.lastRequestAt = this.config.nowFn();
      this.rememberRateLimit(res);
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
        const retryAfter = parseRetryAfterMs(res);
        await sleep(retryAfter ?? 1000 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`Reddit request failed: HTTP ${res.status} for ${url}`);
    }
    throw lastError ?? new Error(`Reddit request failed for ${url}`);
  }

  /** App-only OAuth token (client_credentials grant). Cached until expiry. */
  private async getToken(): Promise<string | null> {
    if (!this.usesOAuth) return null;
    const now = this.config.nowFn();
    if (this.token && this.token.expiresAt > now + 60_000) {
      return this.token.accessToken;
    }
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      "utf8",
    ).toString("base64");
    const res = await this.fetchWithRetry(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "User-Agent": this.config.userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) {
      throw new Error("Reddit OAuth token response missing access_token");
    }
    this.token = {
      accessToken: body.access_token,
      expiresAt: now + (body.expires_in ?? 3600) * 1000,
    };
    return this.token.accessToken;
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    const query = input.query.trim();
    if (!query) throw new Error("Reddit collect requires a non-empty query");
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit) || 10));
    const sinceSeconds = input.since ? Math.floor(input.since.getTime() / 1000) : null;

    const cacheKey = `${query}|${limit}|${sinceSeconds ?? "-"}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.config.nowFn() - cached.at < this.config.cacheTtlMs) {
      return cached.items;
    }

    const token = await this.getToken();
    const base = token ? OAUTH_BASE : PUBLIC_BASE;
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      sort: "relevance",
      t: "all",
      type: "link",
      raw_json: "1",
    });
    const headers: Record<string, string> = {
      "User-Agent": this.config.userAgent,
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await this.fetchWithRetry(`${base}/search?${params}`, { headers });
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      // Reddit serves an HTML block/login wall to unauthenticated callers.
      // Surface it as an auth-mode error (→ OAuth creds), never parse as data.
      throw new Error(
        `Reddit returned non-JSON (${contentType || "unknown content-type"}): ` +
          "unauthenticated requests are blocked — set REDDIT_CLIENT_ID + " +
          "REDDIT_CLIENT_SECRET for app-only OAuth (preferred mode)",
      );
    }
    const listing = (await res.json()) as RedditListing;
    const children = listing?.data?.children ?? [];

    const items: RawSignal[] = [];
    for (const child of children) {
      const data = child?.data;
      if (!data) continue;
      if (sinceSeconds != null && (data.created_utc ?? 0) < sinceSeconds) continue;
      const externalId = data.name ?? (data.id ? `t3_${data.id}` : null);
      if (!externalId) continue;
      items.push({
        source: REDDIT_KEY,
        externalId,
        fetchedAt: new Date(this.config.nowFn()).toISOString(),
        payload: data,
      });
      if (items.length >= limit) break;
    }

    this.cache.set(cacheKey, { at: this.config.nowFn(), items });
    return items;
  }

  normalize(raw: RawSignal): MarketSignal {
    const data = raw.payload as RedditPostData | null | undefined;
    if (!data || typeof data !== "object") {
      throw new Error("Reddit normalize requires a listing-item payload object");
    }
    const permalink = data.permalink ?? null;
    const url = permalink
      ? `https://www.reddit.com${permalink}`
      : (data.url ?? null);
    const title = data.title?.trim() ? data.title : null;
    const selftext = data.selftext?.trim() ? data.selftext : null;
    const created = typeof data.created_utc === "number" ? data.created_utc : null;
    const authorHash = hashRedditAuthor(data.author ?? null, this.config.authorSalt);
    const engagement: SignalEngagement = {
      upvotes: typeof data.score === "number" ? data.score : 0,
      comments: typeof data.num_comments === "number" ? data.num_comments : 0,
      ...(typeof data.upvote_ratio === "number"
        ? { upvote_ratio: data.upvote_ratio }
        : {}),
      ...(typeof data.subreddit === "string" && data.subreddit
        ? { subreddit: data.subreddit }
        : {}),
      author_hash: authorHash,
    };
    return {
      source: REDDIT_KEY,
      source_id: raw.externalId,
      url,
      title,
      text: selftext,
      author: authorHash,
      timestamp: created ? new Date(created * 1000).toISOString() : null,
      engagement,
      market_candidates: [],
      intent: null,
      pain_points: [],
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = this.config.nowFn();
    try {
      if (this.usesOAuth) {
        const token = await this.getToken();
        const ms = this.config.nowFn() - started;
        const quota = this.rate.remaining ? `, ratelimit_remaining=${this.rate.remaining}` : "";
        return {
          ok: !!token,
          detail: token
            ? `oauth app-only ok in ${ms}ms${quota}`
            : "oauth token fetch returned no token",
        };
      }
      // No credentials: cheap limit=1 public probe (shares throttle/backoff/cache).
      const items = await this.collect({ query: "test", limit: 1 });
      const ms = this.config.nowFn() - started;
      const quota = this.rate.remaining ? `, ratelimit_remaining=${this.rate.remaining}` : "";
      return {
        ok: true,
        detail: `public-json ok in ${ms}ms, probe_items=${items.length}${quota} (no OAuth creds — set REDDIT_CLIENT_ID/SECRET for preferred mode)`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, detail: `reddit unreachable: ${message}` };
    }
  }
}
