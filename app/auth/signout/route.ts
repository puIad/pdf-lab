// app/auth/signout/route.ts — POST ends the session and returns to the home page (Part 5.1).

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/db/client";

export async function POST(request: NextRequest) {
  await (await createServerSupabaseClient()).auth.signOut();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
