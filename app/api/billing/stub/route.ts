// app/api/billing/stub/route.ts: the premium checkout stub (Part 5.3). POST {plan: "premium"|"free"}
// flips the signed-in person's plan and logs it in plan_changes. Nothing is charged.

import { NextResponse } from "next/server";
import { billingStore } from "@/lib/billing/store";
import { BILLING_MODE, changePlan, stubAllowed } from "@/lib/billing/stub";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!stubAllowed(process.env)) return NextResponse.json({ error: "The upgrade stub is off on this server." }, { status: 403 });
  const { userId } = await resolveCaller(req.headers);
  if (!userId) return NextResponse.json({ error: "Sign in to change your plan." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { plan?: unknown } | null;
  if (body?.plan !== "premium" && body?.plan !== "free") return NextResponse.json({ error: 'plan must be "premium" or "free"' }, { status: 400 });
  try {
    const change = await changePlan(billingStore(), userId, body.plan);
    return NextResponse.json({ mode: BILLING_MODE, plan: body.plan, changed: change !== null, chargedCents: 0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
