// GET /api/google/callback: where Google sends the person back (Part 5.4). Registered redirect URIs:
// http://localhost:3000/api/google/callback and https://pdf-lab-puiads-projects.vercel.app/api/google/callback.
// The state must be signed for the signed-in person and match this browser's cookie. The result goes
// back to the page that started the flow as ?google=connected or ?google_error=<message>.

import { NextResponse, type NextRequest } from "next/server";
import { vaultSecret } from "@/lib/keys/crypto";
import { completeConnect, googleConfig, GoogleError, NONCE_COOKIE, readState } from "@/lib/google/oauth";
import { supabaseGoogleTokenStore } from "@/lib/google/server";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await resolveCaller(req.headers);
  if (!userId) return NextResponse.json({ error: "Sign in, then connect Google Docs again." }, { status: 401 });
  const q = req.nextUrl.searchParams;
  let next: string;
  try {
    next = readState(vaultSecret(), q.get("state"), userId, req.cookies.get(NONCE_COOKIE)?.value ?? null);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad request." }, { status: 400 });
  }
  const back = (key: "google" | "google_error", value: string) => {
    const url = new URL(next, req.nextUrl.origin);
    url.searchParams.set(key, value);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: NONCE_COOKIE, path: "/api/google" });
    return res;
  };

  const code = q.get("code");
  if (q.get("error") || !code) return back("google_error", q.get("error") === "access_denied" ? "Google access was not granted." : "Google did not complete the sign-in.");
  try {
    await completeConnect({ store: supabaseGoogleTokenStore(), secret: vaultSecret(), userId, cfg: googleConfig(req.nextUrl.origin) }, code);
    return back("google", "connected");
  } catch (err) {
    if (!(err instanceof GoogleError)) console.error("google connect failed", err instanceof Error ? err.message : err);
    return back("google_error", err instanceof GoogleError ? err.message : "Could not save the Google connection.");
  }
}
