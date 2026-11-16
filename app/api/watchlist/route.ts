// app/api/watchlist/route.ts — a signed-in person's watchlist (Phase 4 Part 4.1, PRD §43).
// POST saves a market, seed or idea, DELETE removes one; pages read the list on the server
// (lib/watchlist/store.ts). Signed out: 401, the UI then asks the visitor to sign in (no
// local-only list). Rows are read and removed as the caller, so the table's owner-only policies
// apply. Saving goes through `add_watch` with the service-role key: it checks the plan's cap in
// the statement that inserts (migration 11), and the cap is not something the caller may set.

import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";
import { WATCHLIST_LIMIT } from "@/lib/quotas/quotas";
import { parseWatch } from "@/lib/watchlist/watchlist";

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

    const { data, error } = await createServiceSupabaseClient()
      .rpc("add_watch", { p_user_id: me.userId, p_kind: watch.kind, p_ref: watch.ref, p_region: watch.region, p_seed: watch.seed, p_limit: me.limit })
      .single<{ status: "added" | "exists" | "full"; total: number }>();
    if (error) throw new Error(error.message);
    if (data.status === "full") {
      return NextResponse.json(
        { error: `Your watchlist is full: ${data.total} of ${me.limit} saved on the ${me.plan} plan. Remove one to add another.` },
        { status: 429 },
      );
    }
    return NextResponse.json({ watched: true, count: data.total, limit: me.limit });
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
    const { data, error } = await (await createServerSupabaseClient())
      .from("watchlists")
      .delete()
      .eq("user_id", me.userId)
      .eq("kind", watch.kind)
      .eq("ref", watch.ref)
      .eq("region", watch.region)
      .select("id");
    if (error) throw new Error(error.message);
    // `removed` is 0 when no row matched: a delete that did nothing is told apart from one that worked.
    return NextResponse.json({ watched: false, removed: data.length });
  } catch (err) {
    return failed(err);
  }
}
