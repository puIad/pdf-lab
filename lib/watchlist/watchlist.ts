// lib/watchlist/watchlist.ts — what a watchlist row is and which requests are valid (Phase 4
// Part 4.1). Pure: no database, so the rules are unit tested. The table is `watchlists`.

import { DEFAULT_REGION, isRegion } from "../ideas/seeds.ts";

export type WatchKind = "market" | "seed" | "idea";
export const WATCH_KINDS: WatchKind[] = ["market", "seed", "idea"];

/** What identifies a row for one person: unique (kind, ref, region). */
export interface Watch {
  kind: WatchKind;
  /** A market's id, a seed, or an idea's search phrase (seed and phrase lowercased). */
  ref: string;
  /** The scan region of a seed or idea; "" for a market. */
  region: string;
  /** Idea only: the seed whose scan showed it, so the list can lead back to that scan. */
  seed: string | null;
}

export interface WatchItem extends Watch {
  id: string;
  created_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : "");

/** One string per row, for "is this already saved" lookups in the UI. */
export function watchKey(kind: WatchKind, ref: string, region = ""): string {
  return `${kind}|${kind === "market" ? "" : region}|${text(ref)}`;
}

/**
 * Checks a request body or query (all values untrusted) and returns the row it names.
 * A seed and an idea carry a region; a market does not. An idea also needs its seed.
 */
export function parseWatch(input: { kind?: unknown; ref?: unknown; region?: unknown; seed?: unknown } | null): { watch: Watch } | { error: string } {
  const kind = input?.kind;
  if (kind !== "market" && kind !== "seed" && kind !== "idea") return { error: "kind must be market, seed or idea" };
  const ref = text(input?.ref);

  if (kind === "market") {
    if (!UUID.test(ref)) return { error: "ref must be a market id" };
    return { watch: { kind, ref, region: "", seed: null } };
  }

  const region = input?.region ?? DEFAULT_REGION;
  if (!isRegion(region)) return { error: "region must be one of the listed country codes" };
  if (kind === "seed") {
    // Same bounds as a scan (POST /api/ideas).
    if (ref.length < 2 || ref.length > 80) return { error: "ref must be a 2 to 80 character seed" };
    return { watch: { kind, ref, region, seed: null } };
  }
  if (ref.length < 2 || ref.length > 160) return { error: "ref must be a 2 to 160 character phrase" };
  const seed = text(input?.seed);
  if (seed.length < 2 || seed.length > 80) return { error: "seed must be the 2 to 80 character seed the idea came from" };
  return { watch: { kind, ref, region, seed } };
}
