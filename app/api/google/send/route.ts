// POST /api/google/send { source, notes?, next }: uploads the brief's DOCX (the same generator as the
// DOCX download) to the signed-in person's Google Drive, converted to a Google Doc (Part 5.4).
// 409 with `connect` means the person has no usable Google connection: the page navigates there.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { BriefUnavailable, loadBrief, parseBriefSource } from "@/lib/brief";
import { creationEvent } from "@/lib/analytics/metrics";
import { recordEventSafely } from "@/lib/analytics/store";
import { generateBriefDocx } from "@/lib/export/brief";
import { vaultSecret } from "@/lib/keys/crypto";
import { googleConfig, GoogleError, sendDocx } from "@/lib/google/oauth";
import { supabaseGoogleTokenStore } from "@/lib/google/server";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

const STATUS = { not_configured: 503, not_connected: 409, revoked: 409, bad_state: 400, no_refresh_token: 502, wrong_scope: 502, failed: 502 } as const;

export async function POST(req: Request) {
  const { userId } = await resolveCaller(req.headers);
  if (!userId) return NextResponse.json({ error: "Sign in to send a brief to Google Docs." }, { status: 401 });
  let body: { source?: unknown; notes?: unknown; next?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  try {
    const db = createServiceSupabaseClient();
    const brief = await loadBrief(db, parseBriefSource(body.source), body.notes);
    const cfg = googleConfig(new URL(req.url).origin);
    const doc = await sendDocx(
      { store: supabaseGoogleTokenStore(), secret: vaultSecret(), userId, cfg },
      brief.title,
      new Uint8Array(await generateBriefDocx(brief)),
    );
    const src = brief.source;
    await recordEventSafely(db, creationEvent(userId, src.kind === "opportunity" ? src.id : `${src.seed}: ${src.phrase}`));
    return NextResponse.json({ url: doc.url });
  } catch (err) {
    if (err instanceof BriefUnavailable) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof GoogleError) {
      const connect = err.code === "not_connected" || err.code === "revoked";
      const next = typeof body.next === "string" ? body.next : "/";
      return NextResponse.json(
        { error: err.message, ...(connect ? { connect: `/api/google/connect?next=${encodeURIComponent(next)}` } : {}) },
        { status: STATUS[err.code] },
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
