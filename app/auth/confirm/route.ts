// app/auth/confirm/route.ts — where the sign-in email link lands (Phase 5 Part 5.1).
// Supabase's default link arrives with ?code= (PKCE); a template that sends the token hash
// arrives with ?token_hash=&type=. Either one becomes a session cookie, then the user goes on.

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { createServerSupabaseClient } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  const target = safeNextPath(searchParams.get("next"), "/");

  let message = "The sign-in link is incomplete. Ask for a new one.";
  if (code || (tokenHash && type)) {
    const supabase = await createServerSupabaseClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash as string });
    if (!error) return to(target);
    message = `${error.message}. Ask for a new link.`;
  }
  return to(`/login?error=${encodeURIComponent(message)}`);
}
