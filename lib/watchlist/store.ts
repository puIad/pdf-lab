// lib/watchlist/store.ts — reads a person's watchlist rows (Phase 4 Part 4.1). Server-only.
// The query runs as the signed-in person (session cookie, anon key), so the table's owner-only
// policies decide what comes back; the user_id filter states the same thing in the query.

import { createServerSupabaseClient } from "@/lib/db/client";
import { watchKey, type WatchItem } from "./watchlist.ts";

export const WATCH_COLUMNS = "id, kind, ref, region, seed, created_at";

/** Newest first. Throws when the rows cannot be read. */
export async function listWatches(userId: string): Promise<WatchItem[]> {
  const { data, error } = await (await createServerSupabaseClient())
    .from("watchlists")
    .select(WATCH_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WatchItem[];
}

/** The keys of what a person already saved, for a page's toggles. Empty when signed out or unreadable. */
export async function watchKeys(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    return (await listWatches(userId)).map((w) => watchKey(w.kind, w.ref, w.region));
  } catch (err) {
    // The page still works without the saved marks: a toggle then shows "Save" for a saved row.
    console.error("Could not read the watchlist:", err);
    return [];
  }
}
