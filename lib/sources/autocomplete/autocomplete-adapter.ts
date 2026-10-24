// lib/sources/autocomplete/autocomplete-adapter.ts — search-suggestion miner (Phase 3 Part 3.5).
// Spec: docs/phases/phase-3-explorer.md Part 3.5; method from the PDFMinter teardown
// (docs/research/2026-10-24-pdfminter-teardown.md).
//
// ⚠️ LOCAL-ONLY (DEC-008 option a). These are the unofficial suggest endpoints
// browsers use; they have no API terms, can block or change without notice, and
// Amazon's Conditions of Use bar automated access. The adapter refuses to run
// unless PDFLAB_UNOFFICIAL_AUTOCOMPLETE=1, NODE_ENV !== "production" and VERCEL
// is unset; otherwise collect() throws SourceNotConfiguredError and ingest
// reports it as `skipped`. Shipping this to production needs a new decision.
//
// Output: ONE signal per unique suggested phrase, carrying which engines
// suggested it and its best list position (the demand evidence, QC Rule 4).

import { createHash } from "node:crypto";
import type {
  CollectInput,
  HealthStatus,
  MarketSignal,
  RawSignal,
  SignalEngagement,
  SourceAdapter,
} from "../types.ts";
import { SourceNotConfiguredError } from "../types.ts";

export const AUTOCOMPLETE_KEY = "autocomplete";
export const ENGINES = ["google", "youtube", "bing", "ddg", "amazon"] as const;
export type Engine = (typeof ENGINES)[number];
export const QUESTION_PREFIXES = ["how to", "what is", "why", "best", "can", "is"];
export const MODIFIERS = ["for beginners", "checklist", "plan", "template", "ideas", "tips"];
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
export const MIN_INTERVAL_MS = 250; // per engine
const MAX_LIMIT = 50;
const USER_AGENT = "Mozilla/5.0 (compatible; PDF-Lab-local/0.1)";

export interface SuggestionPayload {
  kind: "suggestion";
  seed: string;
  phrase: string;
  geo: string;
  engines: Engine[]; // engines that suggested this phrase
  positions: Partial<Record<Engine, number>>; // best 0-based position per engine
  enginesOk: Engine[]; // engines that answered at all during this scan
  probes: number; // expansion queries that surfaced it
}

export interface AutocompleteAdapterConfig {
  enabled: boolean;
  disabledReason: string;
  geo: string; // lower-case country code, e.g. "us"
  cacheTtlMs: number;
  minIntervalMs: number;
  fetchFn: (input: string | URL, init?: RequestInit) => Promise<Response>;
  nowFn: () => number;
}

export function autocompleteConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AutocompleteAdapterConfig {
  const reasons: string[] = [];
  if (env.PDFLAB_UNOFFICIAL_AUTOCOMPLETE !== "1") reasons.push("PDFLAB_UNOFFICIAL_AUTOCOMPLETE is not 1");
  if (env.NODE_ENV === "production") reasons.push("NODE_ENV is production");
  if (env.VERCEL) reasons.push("running on Vercel");
  return {
    enabled: reasons.length === 0,
    disabledReason:
      `Autocomplete is local-only (DEC-008): ${reasons.join(", ")}. ` +
      "Set PDFLAB_UNOFFICIAL_AUTOCOMPLETE=1 in .env.local and use `pnpm dev`.",
    geo: (env.AUTOCOMPLETE_GEO || "us").toLowerCase(),
    cacheTtlMs: CACHE_TTL_MS,
    minIntervalMs: MIN_INTERVAL_MS,
    fetchFn: fetch,
    nowFn: Date.now,
  };
}

/** Queries sent to one engine for a seed. A to Z goes to Google only, to keep the scan polite. */
export function expansionPlan(seed: string, engine: Engine): string[] {
  const letters = engine === "google" ? [..."abcdefghijklmnopqrstuvwxyz"].map((l) => `${seed} ${l}`) : [];
  return [seed, ...QUESTION_PREFIXES.map((q) => `${q} ${seed}`), ...MODIFIERS.map((m) => `${seed} ${m}`), ...letters];
}

export function suggestUrl(engine: Engine, q: string, geo: string): string {
  const e = encodeURIComponent(q);
  switch (engine) {
    case "google":
      return `https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&hl=en&gl=${geo}&q=${e}`;
    case "youtube":
      return `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&ie=utf-8&oe=utf-8&hl=en&gl=${geo}&q=${e}`;
    case "bing":
      return `https://api.bing.com/osjson.aspx?query=${e}&mkt=en-${geo.toUpperCase()}`;
    case "ddg":
      return `https://duckduckgo.com/ac/?q=${e}&kl=${geo}-en`;
    case "amazon":
      // shortcut: US marketplace id only; map geo → marketplace id if non-US seeds matter.
      return `https://completion.amazon.com/api/2017/suggestions?mid=ATVPDKIKX0DER&alias=aps&limit=10&prefix=${e}`;
  }
}

/** Engine response → suggestion strings, in rank order. Unknown shapes give []. */
export function parseSuggestions(engine: Engine, body: unknown): string[] {
  let out: unknown[] = [];
  if (engine === "ddg") out = Array.isArray(body) ? body.map((x) => (x as { phrase?: unknown })?.phrase) : [];
  else if (engine === "amazon") out = ((body as { suggestions?: Array<{ value?: unknown }> })?.suggestions ?? []).map((s) => s?.value);
  else out = Array.isArray(body) && Array.isArray(body[1]) ? body[1] : [];
  return out.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

function clean(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return clean(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Hit {
  engines: Set<Engine>;
  positions: Partial<Record<Engine, number>>;
  probes: number;
}

export class AutocompleteAdapter implements SourceAdapter {
  readonly key = AUTOCOMPLETE_KEY;
  readonly displayName = "Search Suggestions (local-only)";
  readonly tiers: 1 | 2 | 3 = 3;

  private cache = new Map<string, { at: number; items: RawSignal[] }>();
  private readonly config: AutocompleteAdapterConfig;

  constructor(config: AutocompleteAdapterConfig) {
    this.config = config;
  }

  private async fetchOne(engine: Engine, q: string, geo = this.config.geo): Promise<string[]> {
    const res = await this.config.fetchFn(suggestUrl(engine, q, geo), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${engine} suggest HTTP ${res.status}`);
    return parseSuggestions(engine, JSON.parse(await res.text()));
  }

  /** Run one engine's plan sequentially (throttled). Returns null if the engine never answered. */
  private async scanEngine(engine: Engine, seed: string, geo: string, hits: Map<string, Hit>): Promise<string | null> {
    let answered = false;
    let lastError = "";
    for (const q of expansionPlan(seed, engine)) {
      try {
        const list = await this.fetchOne(engine, q, geo);
        answered = true;
        const probe = clean(q);
        list.forEach((raw, pos) => {
          const phrase = clean(raw);
          if (phrase === probe) return; // engines echo the typed query first; that is not demand
          const hit = hits.get(phrase) ?? { engines: new Set<Engine>(), positions: {}, probes: 0 };
          hit.engines.add(engine);
          hit.positions[engine] = Math.min(hit.positions[engine] ?? pos, pos);
          hit.probes++;
          hits.set(phrase, hit);
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      await sleep(this.config.minIntervalMs);
    }
    return answered ? null : lastError || `${engine} returned nothing`;
  }

  async collect(input: CollectInput): Promise<RawSignal[]> {
    if (!this.config.enabled) throw new SourceNotConfiguredError(this.config.disabledReason);
    const seed = clean(input.query);
    if (!seed) throw new Error("Autocomplete collect requires a non-empty query");
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit) || 25));
    const geo = (input.geo || this.config.geo).toLowerCase();
    const cacheKey = `${seed}|${limit}|${geo}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.config.nowFn() - cached.at < this.config.cacheTtlMs) return cached.items;

    const hits = new Map<string, Hit>();
    const errors = await Promise.all(ENGINES.map((e) => this.scanEngine(e, seed, geo, hits)));
    const enginesOk = ENGINES.filter((_, i) => errors[i] === null);
    if (enginesOk.length === 0) {
      throw new Error(`All suggest engines failed: ${errors.filter(Boolean).join("; ")}`);
    }

    const seedTokens = new Set(tokens(seed));
    const ranked = [...hits.entries()]
      .filter(([phrase]) => phrase !== seed && tokens(phrase).some((t) => seedTokens.has(t)))
      .map(([phrase, h]) => ({ phrase, h, best: Math.min(...Object.values(h.positions)) }))
      .sort((a, b) => b.h.engines.size - a.h.engines.size || a.best - b.best || a.phrase.localeCompare(b.phrase))
      .slice(0, limit);

    const fetchedAt = new Date(this.config.nowFn()).toISOString();
    const day = fetchedAt.slice(0, 10);
    const items: RawSignal[] = ranked.map(({ phrase, h }) => {
      const payload: SuggestionPayload = {
        kind: "suggestion",
        seed,
        phrase,
        geo,
        engines: ENGINES.filter((e) => h.engines.has(e)),
        positions: h.positions,
        enginesOk,
        probes: h.probes,
      };
      return {
        source: AUTOCOMPLETE_KEY,
        // Seed in the hash: the same phrase from two seeds carries different counts and text.
        // Day in the id: daily snapshots build history (Phase 4.2 "new since last scan").
        externalId: `autocomplete:${geo}:${createHash("sha256").update(`${seed}|${phrase}`).digest("hex").slice(0, 24)}:${day}`,
        fetchedAt,
        payload,
      };
    });
    this.cache.set(cacheKey, { at: this.config.nowFn(), items });
    return items;
  }

  normalize(raw: RawSignal): MarketSignal {
    const p = raw.payload as SuggestionPayload | null;
    if (!p || p.kind !== "suggestion") throw new Error("Autocomplete normalize requires a suggestion payload");
    const where = p.engines.map((e) => `${e} #${(p.positions[e] ?? 0) + 1}`).join(", ");
    const engagement: SignalEngagement = {
      seed: p.seed,
      phrase: p.phrase,
      geo: p.geo,
      engines: p.engines.join(","),
      engine_count: p.engines.length,
      engines_ok: p.enginesOk.length,
      best_position: Math.min(...Object.values(p.positions)),
      probes: p.probes,
    };
    return {
      source: AUTOCOMPLETE_KEY,
      source_id: raw.externalId,
      url: `https://www.google.com/search?q=${encodeURIComponent(p.phrase)}`,
      title: `Search suggestion: "${p.phrase}"`,
      text:
        `"${p.phrase}" was suggested by ${p.engines.length} of ${p.enginesOk.length} answering engines ` +
        `(${where}) while expanding "${p.seed}" (${p.geo.toUpperCase()}).`,
      author: "anonymous",
      timestamp: raw.fetchedAt,
      engagement,
      market_candidates: [],
      intent: null,
      pain_points: [],
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.config.enabled) return { ok: false, detail: this.config.disabledReason };
    try {
      const list = await this.fetchOne("google", "test");
      return { ok: list.length > 0, detail: `google suggest returned ${list.length} items (local-only source)` };
    } catch (err) {
      return { ok: false, detail: `suggest unreachable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}
