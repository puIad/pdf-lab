// lib/monitor/follow.ts: a watched market follows its seed across runs (Part 4.2, defect found in 4.1).
// A watchlist row stores one market row's id. A newer Deep run of the same seed stores new market
// rows, so the row is resolved at read time: the market of the seed's latest run with the same name.

export interface MarketRef {
  id: string;
  name: string;
  runId: string | null;
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The market to show for a watched one: itself when its run is still the seed's latest (or it is a
 * legacy row), else the same-named market of the latest run, else null (the market is not in the
 * newest run; the page says so instead of showing an older run's numbers as current).
 */
export function followMarket(watched: MarketRef, latestRunId: string | null, latestMarkets: MarketRef[]): MarketRef | null {
  if (!watched.runId || watched.runId === latestRunId) return watched;
  return latestMarkets.find((m) => key(m.name) === key(watched.name)) ?? null;
}
