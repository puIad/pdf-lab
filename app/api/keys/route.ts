// app/api/keys/route.ts: a signed-in person's own provider keys (Phase 5 Part 5.2, PRD §34 Mode 2).
// GET lists them masked (last 4 characters and status), PUT saves or rotates one, DELETE removes one.
// The key travels once, in the PUT body, over HTTPS. It is encrypted before it is stored and is
// never returned, logged or echoed in an error.

import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/quotas/guard";
import { vaultSecret } from "@/lib/keys/crypto";
import { supabaseKeyStore } from "@/lib/keys/server";
import { deleteKey, KeyInputError, listKeys, saveKey, type KeyOptions } from "@/lib/keys/vault";

export const dynamic = "force-dynamic";

async function signedIn(req: Request): Promise<string | null> {
  return (await resolveCaller(req.headers)).userId;
}
const signIn = () => NextResponse.json({ error: "Sign in to manage your provider keys." }, { status: 401 });

function failed(err: unknown) {
  if (err instanceof KeyInputError) return NextResponse.json({ error: err.message }, { status: 400 });
  // A database or vault error message never holds the key; it is safe to show.
  return NextResponse.json({ error: err instanceof Error ? err.message : "Could not reach the key vault." }, { status: 500 });
}

export async function GET(req: Request) {
  const userId = await signedIn(req);
  if (!userId) return signIn();
  try {
    return NextResponse.json({ keys: await listKeys(supabaseKeyStore(), userId) });
  } catch (err) {
    return failed(err);
  }
}

export async function PUT(req: Request) {
  const userId = await signedIn(req);
  if (!userId) return signIn();
  let body: { provider?: unknown; apiKey?: unknown; options?: KeyOptions };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  try {
    const key = await saveKey(supabaseKeyStore(), vaultSecret(), { userId, provider: body.provider, apiKey: body.apiKey, options: body.options });
    return NextResponse.json({ key });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(req: Request) {
  const userId = await signedIn(req);
  if (!userId) return signIn();
  const provider = new URL(req.url).searchParams.get("provider");
  try {
    const removed = await deleteKey(supabaseKeyStore(), userId, provider);
    return removed ? NextResponse.json({ removed: true }) : NextResponse.json({ error: "No key saved for that provider." }, { status: 404 });
  } catch (err) {
    return failed(err);
  }
}
