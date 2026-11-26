// app/api/account/route.ts — export or delete your own data (Phase 6 Part 6.3, PRD §57).
// GET returns your rows as JSON; DELETE with {"confirm":"delete my account"} removes the sign-in.
// Deleting the auth user fires the trigger that removes public.users, which cascades to usage
// events, watchlist, metric events and research runs (docs/SCHEMA.md, Sign-in and usage).

import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";
import { buildExport, isDeleteConfirmed, loadExportRows } from "@/lib/privacy/account-data";

export const dynamic = "force-dynamic";

const signIn = () => NextResponse.json({ error: "Sign in to export or delete your data." }, { status: 401 });
const failed = (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });

export async function GET(req: Request) {
  try {
    const caller = await resolveCaller(req.headers);
    if (!caller.userId) return signIn();
    const db = createServiceSupabaseClient();
    // Service role reads, scoped by user_id.
    const rows = await loadExportRows(db, caller.userId);
    const { data: me } = await db.from("users").select("email, plan, created_at").eq("id", caller.userId).maybeSingle();
    const body = buildExport(new Date(), { email: me?.email ?? caller.email, plan: me?.plan ?? null, createdAt: me?.created_at ?? null }, rows);
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="pdf-lab-account.json"', "cache-control": "no-store" },
    });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* an empty body is refused below */
  }
  if (!isDeleteConfirmed(body)) {
    return NextResponse.json({ error: 'Send {"confirm":"delete my account"} to delete your account and its data.' }, { status: 400 });
  }
  try {
    const caller = await resolveCaller(req.headers);
    if (!caller.userId) return signIn();
    const { error } = await createServiceSupabaseClient().auth.admin.deleteUser(caller.userId);
    if (error) {
      // Already deleted (a repeat request): a clean 404, not a server error.
      if (error.status === 404) return NextResponse.json({ error: "This account was already deleted." }, { status: 404 });
      throw new Error(error.message);
    }
    // The session cookies still verify locally until they expire, so clear them in this response.
    await (await createServerSupabaseClient()).auth.signOut({ scope: "local" });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return failed(err);
  }
}
