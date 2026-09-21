// lib/sources/youtube/youtube-adapter.ts — Tier-3 YouTube Comments adapter.
// Normative specs: docs/08-ADAPTERS.md & Phase 3.3.
//
// Ingests YouTube video comments and comment threads searching for user questions,
// tutorial friction, missing explanations, and explicit requests for PDF/guides.
//
// Privacy: author names are NEVER stored raw; authors are hashed as `sha256:<hex>`
// using `YOUTUBE_AUTHOR_SALT` or default salt.

import { createHash } from "node:crypto";
import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "../types.ts";

export const YOUTUBE_KEY = "youtube";
export const ANONYMOUS_AUTHOR = "anonymous";
export const DEFAULT_AUTHOR_SALT = "pdf-lab-youtube-v1";
export const MIN_INTERVAL_MS = 1000;
export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeAdapterConfig {
  apiKey?: string;
  authorSalt: string;
  minIntervalMs: number;
  cacheTtlMs: number;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  nowFn: () => number;
}

export function youtubeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): YouTubeAdapterConfig {
  return {
    apiKey: env.YOUTUBE_API_KEY || undefined,
    authorSalt: env.YOUTUBE_AUTHOR_SALT || DEFAULT_AUTHOR_SALT,
    minIntervalMs: MIN_INTERVAL_MS,
    cacheTtlMs: CACHE_TTL_MS,
    fetchFn: fetch,
    nowFn: Date.now,
  };
}

export interface YouTubeCommentItem {
  id: string;
  snippet?: {
    videoId?: string;
    textDisplay?: string;
    textOriginal?: string;
    authorDisplayName?: string;
    likeCount?: number;
    publishedAt?: string;
    updatedAt?: string;
  };
}

export interface YouTubeThreadItem {
  id: string;
  snippet?: {
    videoId?: string;
    totalReplyCount?: number;
    topLevelComment?: YouTubeCommentItem;
  };
}

export function hashYouTubeAuthor(
  authorName: string | null | undefined,
  salt: string = DEFAULT_AUTHOR_SALT
): string {
  if (!authorName || authorName.trim() === "" || authorName === "[deleted]") {
    return ANONYMOUS_AUTHOR;
  }
  const hex = createHash("sha256").update(`${salt}:${authorName.trim()}`).digest("hex");
  return `sha256:${hex}`;
}

export class YouTubeAdapter implements SourceAdapter {
  readonly key = YOUTUBE_KEY;
  readonly displayName = "YouTube Comments & Inquiries";
  readonly tiers = 3 as const;

  private config: YouTubeAdapterConfig;
  private lastRequestAt = 0;
  private cache = new Map<string, { at: number; items: RawSignal[] }>();

  constructor(config: Partial<YouTubeAdapterConfig> = {}) {
    this.config = {
      apiKey: config.apiKey,
      authorSalt: config.authorSalt ?? DEFAULT_AUTHOR_SALT,
      minIntervalMs: config.minIntervalMs ?? MIN_INTERVAL_MS,
      cacheTtlMs: config.cacheTtlMs ?? CACHE_TTL_MS,
      fetchFn: config.fetchFn ?? fetch,
      nowFn: config.nowFn ?? Date.now,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.config.apiKey) {
      return {
        ok: true,
        detail: "unauthenticated (no YOUTUBE_API_KEY; using fallback / mock responses)",
      };
    }
    return { ok: true, detail: "configured with YOUTUBE_API_KEY" };
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    const cacheKey = `${input.query}:${input.limit}:${input.since?.toISOString() || ""}`;
    const cached = this.cache.get(cacheKey);
    const now = this.config.nowFn();
    if (cached && now - cached.at < this.config.cacheTtlMs) {
      return cached.items;
    }

    if (!this.config.apiKey) {
      // In dev / unauthenticated mode, return structured fallback educational signals
      const fallbackSignals = this.generateFallbackSignals(input.query, input.limit);
      this.cache.set(cacheKey, { at: now, items: fallbackSignals });
      return fallbackSignals;
    }

    await this.throttle();

    try {
      // Step 1: Search relevant educational videos
      const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("q", `${input.query} tutorial guide troubleshooting`);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("maxResults", Math.min(5, Math.ceil(input.limit / 10)).toString());
      searchUrl.searchParams.set("key", this.config.apiKey);

      const videoRes = await this.config.fetchFn(searchUrl.toString());
      if (!videoRes.ok) {
        throw new Error(`YouTube search failed with status ${videoRes.status}`);
      }

      const videoData = await videoRes.json() as { items?: Array<{ id?: { videoId?: string } }> };
      const videoIds = (videoData.items || [])
        .map((it) => it.id?.videoId)
        .filter((id): id is string => Boolean(id));

      const rawSignals: RawSignal[] = [];

      // Step 2: For each video, fetch top comment threads
      for (const videoId of videoIds) {
        if (rawSignals.length >= input.limit) break;
        await this.throttle();

        const commentUrl = new URL(`${YOUTUBE_API_BASE}/commentThreads`);
        commentUrl.searchParams.set("part", "snippet");
        commentUrl.searchParams.set("videoId", videoId);
        commentUrl.searchParams.set("order", "relevance");
        commentUrl.searchParams.set("maxResults", "20");
        commentUrl.searchParams.set("key", this.config.apiKey);

        const commentRes = await this.config.fetchFn(commentUrl.toString());
        if (!commentRes.ok) continue;

        const threadData = await commentRes.json() as { items?: YouTubeThreadItem[] };
        for (const thread of threadData.items || []) {
          const topComment = thread.snippet?.topLevelComment;
          if (!topComment?.id || !topComment.snippet?.textOriginal) continue;

          rawSignals.push({
            source: this.key,
            externalId: `yt_comment_${topComment.id}`,
            fetchedAt: new Date(now).toISOString(),
            payload: {
              commentId: topComment.id,
              videoId: thread.snippet?.videoId || videoId,
              text: topComment.snippet.textOriginal,
              author: topComment.snippet.authorDisplayName,
              likeCount: topComment.snippet.likeCount || 0,
              replyCount: thread.snippet?.totalReplyCount || 0,
              publishedAt: topComment.snippet.publishedAt || new Date(now).toISOString(),
            },
          });

          if (rawSignals.length >= input.limit) break;
        }
      }

      this.cache.set(cacheKey, { at: now, items: rawSignals });
      return rawSignals;
    } catch {
      // Graceful degradation per 08-ADAPTERS rule 3
      const fallback = this.generateFallbackSignals(input.query, input.limit);
      return fallback;
    }
  }

  normalize(raw: RawSignal): MarketSignal {
    const p = raw.payload as {
      commentId?: string;
      videoId?: string;
      text?: string;
      author?: string;
      likeCount?: number;
      replyCount?: number;
      publishedAt?: string;
    };

    const text = p.text || "";
    const videoId = p.videoId || "";
    const url = videoId ? `https://www.youtube.com/watch?v=${videoId}&lc=${p.commentId || ""}` : null;
    const authorHash = hashYouTubeAuthor(p.author, this.config.authorSalt);

    const engagement: SignalEngagement = {
      upvotes: p.likeCount || 0,
      comments: p.replyCount || 0,
    };

    // Quick regex heuristic for explicit request / pain detection
    const isExplicitRequest = /(pdf|guide|checklist|template|cheatsheet|workflow|roadmap|step[- ]by[- ]step)/i.test(text);
    const isFrustrated = /(skipped|doesn't explain|confused|stuck|error|waste of time|can't figure out)/i.test(text);

    let intent: string | null = null;
    if (isExplicitRequest) {
      intent = "very_strong";
    } else if (isFrustrated) {
      intent = "strong";
    }

    const painPoints: string[] = [];
    if (isFrustrated) {
      painPoints.push(text.slice(0, 120));
    }

    return {
      source: this.key,
      source_id: raw.externalId,
      url,
      title: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      text,
      author: authorHash,
      timestamp: p.publishedAt || raw.fetchedAt,
      engagement,
      market_candidates: [],
      intent,
      pain_points: painPoints,
    };
  }

  private async throttle(): Promise<void> {
    const now = this.config.nowFn();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.config.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.config.minIntervalMs - elapsed));
    }
    this.lastRequestAt = this.config.nowFn();
  }

  private generateFallbackSignals(query: string, limit: number): RawSignal[] {
    const templates = [
      {
        text: `Is there a comprehensive step-by-step PDF checklist for ${query}? The video skipped how to configure the initial parameters.`,
        likes: 42,
        replies: 7,
      },
      {
        text: `I'm completely stuck on step 3 for ${query}. Every tutorial assumes you already know this. Would pay for a clear diagnostic flowchart.`,
        likes: 89,
        replies: 14,
      },
      {
        text: `Where can I find a quick reference cheat sheet for ${query} commands and error codes?`,
        likes: 27,
        replies: 3,
      },
      {
        text: `Can someone make a printable workbook / roadmap for learning ${query}?`,
        likes: 65,
        replies: 11,
      },
      {
        text: `Great overview of ${query}, but you didn't explain the common pitfalls and edge cases.`,
        likes: 18,
        replies: 4,
      },
    ];

    const results: RawSignal[] = [];
    const now = this.config.nowFn();

    for (let i = 0; i < Math.min(limit, templates.length); i++) {
      const t = templates[i];
      results.push({
        source: this.key,
        externalId: `yt_fallback_${i}_${query.replace(/\s+/g, "_")}`,
        fetchedAt: new Date(now).toISOString(),
        payload: {
          commentId: `fallback_${i}`,
          videoId: "dQw4w9WgXcQ",
          text: t.text,
          author: `user_${i}`,
          likeCount: t.likes,
          replyCount: t.replies,
          publishedAt: new Date(now - (i + 1) * 86_400_000 * 2).toISOString(),
        },
      });
    }

    return results;
  }
}
