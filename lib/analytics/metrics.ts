// lib/analytics/metrics.ts — the success-metrics events and the numbers read from them (Phase 6
// Part 6.2, PRD §58 to §59). Pure: no database, so the definitions are unit tested. The table is
// `metric_events`; lib/analytics/store.ts reads and writes it.
//
// Definitions (the PRD text is not in the repo, so they are stated here and in SCHEMA.md):
//   validated opportunity  an opportunity of a completed Deep run that has at least one evidence
//                          row naming a stored source and carrying a url or an excerpt (QC Rule 1);
//   active user            a signed-in person with a counted action (usage_events) or a metric
//                          event in the window;
//   north star             validated opportunities discovered in the window per active user.
//                          Searches performed are never the numerator.

import type { WatchKind } from "../watchlist/watchlist.ts";

export const METRIC_KINDS = ["saved", "useful_vote", "new_market", "research_to_creation", "monitor_return"] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

/** One event as it is stored. `dedupeKey` makes a repeat a no-op (or, for a vote, a change). */
export interface MetricEvent {
  userId: string;
  kind: MetricKind;
  subjectType: "market" | "seed" | "idea" | "opportunity" | "brief";
  subjectRef: string;
  /** useful_vote only: 1 useful, 0 not useful. */
  value: 0 | 1 | null;
  dedupeKey: string | null;
}

/** Usefulness (PRD §58): a person kept something. Only the first save of a thing counts. */
export function savedEvent(userId: string, watch: { kind: WatchKind; ref: string; region: string }): MetricEvent {
  return {
    userId,
    kind: "saved",
    subjectType: watch.kind,
    subjectRef: watch.ref,
    value: null,
    dedupeKey: `saved:${userId}:${watch.kind}:${watch.region}:${watch.ref}`,
  };
}

/** Quality (PRD §58): one vote per person per opportunity; voting again changes it. */
export function voteEvent(userId: string, opportunityId: string, useful: boolean): MetricEvent {
  return {
    userId,
    kind: "useful_vote",
    subjectType: "opportunity",
    subjectRef: opportunityId,
    value: useful ? 1 : 0,
    dedupeKey: `vote:${userId}:${opportunityId}`,
  };
}

/** Research to creation: the person built a brief file from an opportunity or an idea. */
export function creationEvent(userId: string, subjectRef: string): MetricEvent {
  return { userId, kind: "research_to_creation", subjectType: "brief", subjectRef: subjectRef.slice(0, 200), value: null, dedupeKey: null };
}

/** Retention: the person opened their watchlist. One per person per UTC day. */
export function returnEvent(userId: string, now: Date): MetricEvent {
  const day = now.toISOString().slice(0, 10);
  return { userId, kind: "monitor_return", subjectType: "market", subjectRef: day, value: null, dedupeKey: `return:${userId}:${day}` };
}

/** A Deep run saved a market no earlier row carries (the run's owner is the one who found it). */
export function newMarketEvent(userId: string, marketId: string): MetricEvent {
  return { userId, kind: "new_market", subjectType: "market", subjectRef: marketId, value: null, dedupeKey: `market:${marketId}` };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Checks a vote request body (untrusted). */
export function parseVote(input: { opportunityId?: unknown; useful?: unknown } | null): { opportunityId: string; useful: boolean } | { error: string } {
  const id = typeof input?.opportunityId === "string" ? input.opportunityId.trim().toLowerCase() : "";
  if (!UUID.test(id)) return { error: "opportunityId must be an opportunity id" };
  if (typeof input?.useful !== "boolean") return { error: "useful must be true or false" };
  return { opportunityId: id, useful: input.useful };
}

/** What the dashboard reads, already fetched for the window. */
export interface MetricsInput {
  /** Opportunities of completed Deep runs in the window, with the run's owner (null when signed out). */
  opportunities: Array<{ id: string; runUserId: string | null; sourcedEvidence: number }>;
  /** Signed-in people with a counted action or an event in the window (repeats are fine). */
  activeUserIds: string[];
  events: Array<{ kind: MetricKind; userId: string; value: number | null }>;
}

export interface Metrics {
  /** Validated opportunities per active user; null ("Not observed") with no active user. */
  northStar: number | null;
  validatedOpportunities: number;
  activeUsers: number;
  /** Share of the window's opportunities with at least one sourced evidence row. */
  coverage: { opportunities: number; withEvidence: number; share: number | null };
  saved: number;
  votes: { useful: number; notUseful: number };
  newMarkets: number;
  /** People who built a brief, of the people who discovered a validated opportunity. */
  conversion: { discoverers: number; creators: number; share: number | null };
  /** Watchlist opens (one per person per day) and the people who made them. */
  returns: { events: number; people: number };
}

export function computeMetrics(input: MetricsInput): Metrics {
  const validated = input.opportunities.filter((o) => o.sourcedEvidence > 0);
  const active = new Set(input.activeUserIds);
  const ofKind = (kind: MetricKind) => input.events.filter((e) => e.kind === kind);

  const discoverers = new Set(validated.map((o) => o.runUserId).filter((u): u is string => Boolean(u)));
  const creators = new Set(ofKind("research_to_creation").map((e) => e.userId).filter((u) => discoverers.has(u)));
  const votes = ofKind("useful_vote");
  const returns = ofKind("monitor_return");

  return {
    northStar: active.size > 0 ? validated.length / active.size : null,
    validatedOpportunities: validated.length,
    activeUsers: active.size,
    coverage: {
      opportunities: input.opportunities.length,
      withEvidence: validated.length,
      share: input.opportunities.length > 0 ? validated.length / input.opportunities.length : null,
    },
    saved: ofKind("saved").length,
    votes: { useful: votes.filter((v) => v.value === 1).length, notUseful: votes.filter((v) => v.value === 0).length },
    newMarkets: ofKind("new_market").length,
    conversion: { discoverers: discoverers.size, creators: creators.size, share: discoverers.size > 0 ? creators.size / discoverers.size : null },
    returns: { events: returns.length, people: new Set(returns.map((r) => r.userId)).size },
  };
}

/** How far back the dashboard looks. */
export const WINDOW_DAYS = 30;
