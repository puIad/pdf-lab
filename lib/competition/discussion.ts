// lib/competition/discussion.ts — which stored buyer discussion belongs to a market (issue #89, DEC-018 c).
// Marketplace listings carry no review text, so a market's gaps are mined from the run's stored Reddit
// and YouTube signals that talk about the market's topic. They are buyer discussion, never reviews of the
// listings, and every reader labels them so.

import { marketForCompetitor, type CompetitorMarket } from "./map.ts";

export const BUYER_DISCUSSION_LABEL = "buyer discussion, not reviews of these listings";

const DISCUSSION_SOURCES = new Set(["reddit", "youtube"]);

export interface DiscussionSignal {
  id: string;
  title: string | null;
  source_type: string;
  analysis?: { problem: string } | null;
}

/**
 * The run's Reddit and YouTube signals that match `marketId` by topic, the same match a marketplace
 * listing gets (marketForCompetitor), whichever market they were clustered into or none. Signals the
 * market already holds are left out: the caller mines those anyway.
 */
export function discussionForMarket<T extends DiscussionSignal>(
  marketId: string,
  markets: CompetitorMarket[],
  seed: string,
  pool: T[],
): T[] {
  const own = new Set(markets.find((m) => m.id === marketId)?.signalIds);
  return pool.filter(
    (s) =>
      DISCUSSION_SOURCES.has(s.source_type) &&
      !own.has(s.id) &&
      marketForCompetitor({ title: `${s.title ?? ""} ${s.analysis?.problem ?? ""}` }, markets, seed) === marketId,
  );
}
