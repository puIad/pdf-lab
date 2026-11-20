// app/api/settings/extraction/test/route.ts — POST { provider, model }: one short chat call.
// Answers whether the model replied and how long it took. Only a listed candidate can be tested.

import { NextResponse } from "next/server";
import { getRouter } from "@/lib/ai/index";
import { candidateModels, testModel } from "@/lib/ai/extraction-mode";
import { resolveCaller } from "@/lib/quotas/guard";
import { canManageSettings } from "@/lib/settings/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const caller = await resolveCaller(req.headers);
  if (!canManageSettings(caller)) return NextResponse.json({ error: "Only the owner can test models." }, { status: 403 });

  let body: { provider?: unknown; model?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  const router = getRouter();
  const listed = candidateModels(router.configuredProviderNames()).some((c) => c.provider === body?.provider && c.model === body?.model);
  if (!listed) return NextResponse.json({ error: "Not a candidate model of a configured provider." }, { status: 400 });

  const test = await testModel(router, { provider: body!.provider as string, model: body!.model as string });
  return NextResponse.json({ test });
}
