// lib/sources/wikipedia/wikipedia-adapter.ts — Wikipedia pageviews adapter (Phase 3 Part 3.5).
// Spec: docs/phases/phase-3-explorer.md Part 3.5, teardown in docs/research/.
//
// Official, keyless APIs: MediaWiki Action API (title lookup) + Wikimedia
// Analytics REST (per-article daily pageviews). Wikimedia asks for a
// descriptive User-Agent with a contact URL; we send the project URL only
// (no personal data). Output is ONE signal per seed: the last 28 days vs the
// previous 56 days, i.e. two dated windows with counts (QC Rule 2).
// No matching article → zero signals (honest), never a guessed page.

import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "../types.ts";

export const WIKIPEDIA_KEY = "wikipedia";
export const WIKI_API = "https://en.wikipedia.org/w/api.php";
export const PAGEVIEWS_API =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
export const DEFAULT_USER_AGENT = "PDF-Lab/0.1 (+https://pdf-lab-puiads-projects.vercel.app)";
export const RECENT_DAYS = 28;
export const PRIOR_DAYS = 56;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // daily data
const TREND_THRESHOLD_PCT = 15;

export interface PageviewsPayload {
  kind: "pageviews";
  query: string;
  article: string; // display title, e.g. "Intermittent fasting"
  start: string; // YYYY-MM-DD, inclusive
  end: string;
  recentDays: number;
  priorDays: number;
  recentViews: number;
  priorViews: number;
  points: Array<{ date: string; views: number }>;
}

export interface WikipediaAdapterConfig {
  userAgent: string;
  cacheTtlMs: number;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  nowFn: () => number;
}

export function wikipediaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WikipediaAdapterConfig {
  return {
    userAgent: env.WIKIMEDIA_USER_AGENT || DEFAULT_USER_AGENT,
    cacheTtlMs: CACHE_TTL_MS,
    fetchFn: fetch,
    nowFn: Date.now,
  };
}

const STOP = new Set(["a", "an", "the", "of", "for", "and", "to", "in", "on", "with", "how", "what", "is"]);

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

/** Every seed word must appear in the title, allowing stems ("budgeting" ~ "Budget"). */
export function titleMatches(seed: string, title: string): boolean {
  const seedWords = words(seed);
  const titleWords = words(title);
  if (seedWords.length === 0) return false;
  return seedWords.every((s) =>
    titleWords.some((t) => t === s || (Math.min(s.length, t.length) >= 4 && (t.startsWith(s) || s.startsWith(t)))),
  );
}

function ymd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
}

function isoDay(stamp: string): string {
  // "2026100100" → "2026-10-01"
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
}

function windowStats(p: PageviewsPayload) {
  const recentAvg = p.recentDays > 0 ? p.recentViews / p.recentDays : 0;
  const priorAvg = p.priorDays > 0 ? p.priorViews / p.priorDays : 0;
  const changePct = priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : null;
  const direction =
    changePct === null
      ? "unknown"
      : changePct >= TREND_THRESHOLD_PCT
        ? "rising"
        : changePct <= -TREND_THRESHOLD_PCT
          ? "falling"
          : "flat";
  return { recentAvg: Math.round(recentAvg), priorAvg: Math.round(priorAvg), changePct, direction };
}

interface ApiPage {
  title?: string;
  index?: number;
  missing?: boolean;
  invalid?: boolean;
  pageprops?: Record<string, unknown>;
}

export class WikipediaAdapter implements SourceAdapter {
  readonly key = WIKIPEDIA_KEY;
  readonly displayName = "Wikipedia Pageviews";
  readonly tiers: 1 | 2 | 3 = 3;

  private cache = new Map<string, { at: number; items: RawSignal[] }>();
  private readonly config: WikipediaAdapterConfig;

  constructor(config: WikipediaAdapterConfig) {
    this.config = config;
  }

  private async getJson(url: string): Promise<{ status: number; body: unknown }> {
    const res = await this.config.fetchFn(url, {
      headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
    });
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) throw new Error(`Wikipedia request failed: HTTP ${res.status} for ${new URL(url).pathname}`);
    return { status: res.status, body: await res.json() };
  }

  private async pages(params: Record<string, string>): Promise<ApiPage[]> {
    const qs = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "pageprops",
      ppprop: "disambiguation",
      ...params,
    });
    const { body } = await this.getJson(`${WIKI_API}?${qs}`);
    return ((body as { query?: { pages?: ApiPage[] } } | null)?.query?.pages ?? []).filter(
      (p) => p.title && !p.missing && !p.invalid && !(p.pageprops && "disambiguation" in p.pageprops),
    );
  }

  /** Exact title (following redirects) first, then the top 5 search hits that contain the seed's words. */
  async resolveArticle(query: string): Promise<string | null> {
    const exact = await this.pages({ titles: query });
    if (exact[0]?.title) return exact[0].title;
    const hits = await this.pages({ generator: "search", gsrsearch: query, gsrlimit: "5" });
    hits.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    // shortcut: word-match only; "keto diet" misses "Ketogenic diet". Upgrade with a redirect/link walk if it matters.
    return hits.find((p) => titleMatches(query, p.title as string))?.title ?? null;
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    const query = input.query.trim();
    if (!query) throw new Error("Wikipedia collect requires a non-empty query");
    const cached = this.cache.get(query.toLowerCase());
    if (cached && this.config.nowFn() - cached.at < this.config.cacheTtlMs) return cached.items;

    const article = await this.resolveArticle(query);
    let items: RawSignal[] = [];
    if (article) {
      const endMs = this.config.nowFn() - 86400_000; // yesterday: today's data is not final
      const startMs = endMs - (RECENT_DAYS + PRIOR_DAYS - 1) * 86400_000;
      const path = encodeURIComponent(article.replace(/ /g, "_"));
      const { body } = await this.getJson(`${PAGEVIEWS_API}/${path}/daily/${ymd(startMs)}/${ymd(endMs)}`);
      const points = ((body as { items?: Array<{ timestamp?: string; views?: number }> } | null)?.items ?? [])
        .filter((i) => typeof i.timestamp === "string" && typeof i.views === "number")
        .map((i) => ({ date: isoDay(i.timestamp as string), views: i.views as number }));
      if (points.length > 0) {
        const recent = points.slice(-RECENT_DAYS);
        const prior = points.slice(0, Math.max(0, points.length - RECENT_DAYS));
        const sum = (ps: typeof points) => ps.reduce((a, p) => a + p.views, 0);
        const payload: PageviewsPayload = {
          kind: "pageviews",
          query,
          article,
          start: points[0].date,
          end: points[points.length - 1].date,
          recentDays: recent.length,
          priorDays: prior.length,
          recentViews: sum(recent),
          priorViews: sum(prior),
          points,
        };
        items = [
          {
            source: WIKIPEDIA_KEY,
            // Date in the id: one snapshot per day, so re-scans build history instead of deduping away.
            externalId: `wikipedia:pv:${article.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${payload.end}`,
            fetchedAt: new Date(this.config.nowFn()).toISOString(),
            payload,
          },
        ];
      }
    }
    this.cache.set(query.toLowerCase(), { at: this.config.nowFn(), items });
    return items;
  }

  normalize(raw: RawSignal): MarketSignal {
    const p = raw.payload as PageviewsPayload | null;
    if (!p || p.kind !== "pageviews") throw new Error("Wikipedia normalize requires a pageviews payload");
    const s = windowStats(p);
    const change = s.changePct === null ? "no prior data" : `${s.changePct > 0 ? "+" : ""}${s.changePct}%`;
    const engagement: SignalEngagement = {
      seed: p.query,
      article: p.article,
      recent_views: p.recentViews,
      prior_views: p.priorViews,
      recent_days: p.recentDays,
      prior_days: p.priorDays,
      recent_daily_avg: s.recentAvg,
      prior_daily_avg: s.priorAvg,
      change_pct: s.changePct,
      direction: s.direction,
    };
    return {
      source: WIKIPEDIA_KEY,
      source_id: raw.externalId,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.article.replace(/ /g, "_"))}`,
      title: `Wikipedia "${p.article}" pageviews: ${s.recentAvg}/day last ${p.recentDays}d vs ${s.priorAvg}/day prior ${p.priorDays}d (${change})`,
      text:
        `English Wikipedia article "${p.article}" (matched for "${p.query}") had ${p.recentViews} user pageviews ` +
        `from the last ${p.recentDays} days and ${p.priorViews} in the ${p.priorDays} days before ` +
        `(${p.start} to ${p.end}); daily average change ${change}, direction ${s.direction}.`,
      author: "anonymous",
      timestamp: `${p.end}T00:00:00.000Z`,
      engagement,
      market_candidates: [],
      intent: null,
      pain_points: [],
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = this.config.nowFn();
    try {
      const day = ymd(this.config.nowFn() - 2 * 86400_000);
      await this.getJson(`${PAGEVIEWS_API}/Main_Page/daily/${day}/${day}`);
      return { ok: true, detail: `wikimedia pageviews ok in ${this.config.nowFn() - started}ms` };
    } catch (err) {
      return { ok: false, detail: `wikimedia unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
