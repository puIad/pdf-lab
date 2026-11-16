// app/api/watchlist/route.ts — a signed-in person's watchlist (Phase 4 Part 4.1, PRD §43).
// POST saves a market, seed or idea, DELETE removes one; pages read the list on the server
// (lib/watchlist/store.ts). Signed out: 401, the UI then asks the visitor to sign in (no
// local-only list). Rows are read and written as the caller, so the table's owner-only policies
// apply; nothing here uses the service-role key.

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";
import { WATCHLIST_LIMIT } from "@/lib/quotas/quotas";
import { listWatches } from "@/lib/watchlist/store";
import { parseWatch, watchKey } from "@/lib/watchlist/watchlist";

export const dynamic = "force-dynamic";

const signIn = () => NextResponse.json({ error: "Sign in to keep a watchlist." }, { status: 401 });
const failed = (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });

/** The caller's user id and how many rows their plan holds; null when signed out. */
async function owner(headers: Headers): Promise<{ userId: string; limit: number; plan: "free" | "premium" } | null> {
  const caller = await resolveCaller(headers);
  if (!caller.userId) return null;
  const plan = caller.plan === "premium" ? "premium" : "free";
  return { userId: caller.userId, limit: WATCHLIST_LIMIT[plan], plan };
}

async function readWatch(req: Request) {
  try {
    return parseWatch((await req.json()) as Record<string, unknown> | null);
  } catch {
    return { error: "body must be valid JSON" };
  }
}

export async function POST(req: Request) {
  const parsed = await readWatch(req);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { watch } = parsed;
  try {
    const me = await owner(req.headers);
    if (!me) return signIn();

    const rows = await listWatches(me.userId);
    const key = watchKey(watch.kind, watch.ref, watch.region);
    if (rows.some((r) => watchKey(r.kind, r.ref, r.region) === key)) return NextResponse.json({ watched: true, count: rows.length, limit: me.limit });
    // shortcut: read then insert, so two requests in the same instant can pass the cap by one.
    if (rows.length >= me.limit) {
      return NextResponse.json(
        { error: `Your watchlist is full: ${rows.length} of ${me.limit} saved on the ${me.plan} plan. Remove one to add another.` },
        { status: 429 },
      );
    }

    const { error } = await (await createServerSupabaseClient()).from("watchlists").insert({ user_id: me.userId, ...watch });
    // 23505: the same row was saved by a request that ran between the read and the insert.
    if (error && error.code !== "23505") throw new Error(error.message);
    return NextResponse.json({ watched: true, count: rows.length + (error ? 0 : 1), limit: me.limit });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(req: Request) {
  const parsed = await readWatch(req);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { watch } = parsed;
  try {
    const me = await owner(req.headers);
    if (!me) return signIn();
    const { error } = await (await createServerSupabaseClient())
      .from("watchlists")
      .delete()
      .eq("user_id", me.userId)
      .eq("kind", watch.kind)
      .eq("ref", watch.ref)
      .eq("region", watch.region);
    if (error) throw new Error(error.message);
    return NextResponse.json({ watched: false });
  } catch (err) {
    return failed(err);
  }
}
