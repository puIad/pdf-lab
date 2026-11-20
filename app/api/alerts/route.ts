import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { resolveCaller } from "@/lib/quotas/guard";

// Part 4.3. POST /api/alerts marks every unread alert of the signed-in person read (the alerts page
// reads alerts and the digest on the server). In-app only: nothing is emailed or pushed.

export const dynamic = "force-dynamic";

const signIn = () => NextResponse.json({ error: "Sign in to see your alerts." }, { status: 401 });
const failed = (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });

export async function POST(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!caller.userId) return signIn();
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", caller.userId)
      .is("read_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ marked: data.length });
  } catch (err) {
    return failed(err);
  }
}
