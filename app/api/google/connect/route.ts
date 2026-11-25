// GET /api/google/connect?next=/path: starts the Google sign-in for "Send to Google Docs" (Part 5.4).
// A navigation, not a fetch: it redirects to Google's consent screen (drive.file only). The signed
// state names the person and the return path; its nonce also goes into an httpOnly cookie, so the
// callback only accepts the browser that started the flow.

import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { vaultSecret } from "@/lib/keys/crypto";
import { authUrl, googleConfig, GoogleError, newState, NONCE_COOKIE } from "@/lib/google/oauth";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await resolveCaller(req.headers);
  if (!userId) return NextResponse.json({ error: "Sign in to connect Google Docs." }, { status: 401 });
  try {
    const cfg = googleConfig(req.nextUrl.origin);
    const { state, nonce } = newState(vaultSecret(), userId, safeNextPath(req.nextUrl.searchParams.get("next"), "/"));
    const res = NextResponse.redirect(authUrl(cfg, state));
    res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/google", maxAge: 600 });
    return res;
  } catch (err) {
    const status = err instanceof GoogleError ? 503 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start the Google sign-in." }, { status });
  }
}
