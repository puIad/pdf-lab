// DELETE /api/google: disconnect Google Docs for the signed-in person (Part 5.4). The grant is revoked
// at Google first, then the stored token is deleted. If Google does not confirm, the token stays so the
// person can try again.

import { NextResponse } from "next/server";
import { vaultSecret } from "@/lib/keys/crypto";
import { disconnect, googleConfig, GoogleError } from "@/lib/google/oauth";
import { supabaseGoogleTokenStore } from "@/lib/google/server";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const { userId } = await resolveCaller(req.headers);
  if (!userId) return NextResponse.json({ error: "Sign in to manage Google Docs." }, { status: 401 });
  try {
    const removed = await disconnect({ store: supabaseGoogleTokenStore(), secret: vaultSecret(), userId, cfg: googleConfig(new URL(req.url).origin) });
    return NextResponse.json({ disconnected: removed });
  } catch (err) {
    const status = err instanceof GoogleError ? (err.code === "not_configured" ? 503 : 502) : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not disconnect Google Docs." }, { status });
  }
}
