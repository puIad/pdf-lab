// lib/sources/types.ts — SourceAdapter + MarketSignal contracts.
// Normative spec: docs/08-ADAPTERS.md ("The interface — implement exactly").
// Any change to these shapes requires a DECISIONS.md entry.

/** Input to `SourceAdapter.collect`. */
export interface CollectInput {
  query: string;
  limit: number;
  since?: Date;
}

/** Result of `SourceAdapter.healthCheck`. Never throws — failure is `{ ok: false }`. */
export interface HealthStatus {
  ok: boolean;
  detail?: string;
}

/**
 * One raw item as collected from a source, before normalization.
 * `payload` is adapter-specific (e.g. a Reddit listing child's `data` object).
 */
export interface RawSignal {
  /** Adapter key that produced this item (e.g. 'reddit'). */
  source: string;
  /** Source-native id for dedup (e.g. Reddit fullname `t3_abc123`). */
  externalId: string;
  /** When this item was fetched (ISO string). */
  fetchedAt: string;
  /** Adapter-specific raw payload. */
  payload: unknown;
}

/** Engagement counters; exact keys vary per source, common keys below. */
export interface SignalEngagement {
  upvotes?: number;
  comments?: number;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Normalized market signal (PRD §12) — maps to a `signals` row plus
 * pipeline scratch fields filled by later Phase 1 parts.
 *
 * `author` is a `sha256:<hex>` hash or `'anonymous'` — NEVER a raw
 * third-party username (docs/04-SCHEMA.md + docs/06-EVIDENCE-CONTRACT.md).
 */
export interface MarketSignal {
  /** Adapter key, e.g. 'reddit'. Matches `sources.type`. */
  source: string;
  /** External id for dedup → `signals.external_id`. */
  source_id: string;
  /** Canonical URL → `signals.url`. */
  url: string | null;
  /** Title → `signals.title`. */
  title: string | null;
  /** Body text → `signals.content`. */
  text: string | null;
  /** Hashed/anonymous author. Never a raw username. */
  author: string | null;
  /** Publish time (ISO) → `signals.published_at`. */
  timestamp: string | null;
  /** Counters → `signals.engagement` jsonb. */
  engagement: SignalEngagement;
  /** Candidate market names (clustering fills these in Part 1.4; [] here). */
  market_candidates: string[];
  /** Buyer intent weak|medium|strong|very_strong (extraction fills in Part 1.3; null here). */
  intent: string | null;
  /** Observed pain phrases (extraction fills in Part 1.3; [] here). */
  pain_points: string[];
}

export interface SourceAdapter {
  key: string; // 'reddit' | 'gtrends' | 'web' | 'etsy' | ...
  displayName: string;
  tiers: 1 | 2 | 3; // PRD §11 priority tier
  // Collect raw items for a query/window; return NORMALIZED signals (PRD §12).
  collect(input: CollectInput): Promise<RawSignal[]>;
  normalize(raw: RawSignal): MarketSignal; // maps to `signals` row shape
  healthCheck(): Promise<HealthStatus>;
}

/**
 * Thrown by `collect` when the adapter has no credentials/config and therefore
 * cannot run (e.g. web adapter without SERPER_API_KEY). Additive export from
 * Phase 1 Part 1.2 (DEC-002): lets the ingest pipeline report the source as
 * `skipped` (honest completeness, PRD §55) instead of `failed`. No interface
 * change — existing adapters are unaffected.
 */
export class SourceNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceNotConfiguredError";
  }
}
