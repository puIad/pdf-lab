// app/api/settings/extraction/route.ts — the extraction mode (Part 6.9, DEC-015).
// POST { mode }: saves it. A model mode is tested again here and refused unless it answers.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { getRouter } from "@/lib/ai/index";
import { candidateModels, checkModeForSave, parseExtractionMode } from "@/lib/ai/extraction-mode";
import { saveExtractionMode } from "@/lib/settings/extraction-mode";
import { resolveCaller } from "@/lib/quotas/guard";
import { canManageSettings } from "@/lib/settings/access";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!canManageSettings(caller)) return NextResponse.json({ error: "Only the owner can change settings." }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  const mode = parseExtractionMode((raw as { mode?: unknown } | null)?.mode);
  if (!mode) return NextResponse.json({ error: "mode must be { kind: 'pasted' } or { kind: 'model', provider, model }" }, { status: 400 });

  const router = getRouter();
  if (mode.kind === "model" && !candidateModels(router.configuredProviderNames()).some((c) => c.provider === mode.provider && c.model === mode.model)) {
    return NextResponse.json({ error: "Not a candidate model of a configured provider." }, { status: 400 });
  }
  const check = await checkModeForSave(router, mode);
  if (!check.ok) {
    return NextResponse.json({ error: "That model did not answer, so it cannot be the extraction mode.", test: check.test }, { status: 422 });
  }
  try {
    await saveExtractionMode(createServiceSupabaseClient(), mode);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ mode, test: check.test ?? null });
}
