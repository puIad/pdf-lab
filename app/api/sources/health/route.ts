import { NextResponse } from "next/server";
import { listAdapters } from "@/lib/sources/index";
import type { HealthStatus } from "@/lib/sources/index";
import { resolveCaller } from "@/lib/quotas/guard";

export const dynamic = "force-dynamic";

const ADAPTER_TIMEOUT_MS = 10_000;

function withTimeout(
  promise: Promise<HealthStatus>,
  ms: number,
): Promise<HealthStatus> {
  return Promise.race([
    promise,
    new Promise<HealthStatus>((resolve) =>
      setTimeout(() => resolve({ ok: false, detail: `timeout after ${ms}ms` }), ms),
    ),
  ]);
}

export async function GET(req: Request) {
  // Each probe is a real adapter call (Serper spends a credit), so outside a dev server only the
  // server key may run it (Part 5.1).
  const caller = await resolveCaller(req.headers);
  if (caller.plan !== "internal" && caller.plan !== "local") {
    return NextResponse.json({ error: "This endpoint needs the internal API key." }, { status: 401 });
  }
  const adapters = listAdapters();
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      let status: HealthStatus;
      try {
        status = await withTimeout(adapter.healthCheck(), ADAPTER_TIMEOUT_MS);
      } catch {
        // healthCheck should never throw, but never let one adapter sink the endpoint.
        status = { ok: false, detail: "healthCheck threw" };
      }
      return {
        key: adapter.key,
        displayName: adapter.displayName,
        tiers: adapter.tiers,
        ...status,
      };
    }),
  );
  const ok = results.length > 0 && results.every((r) => r.ok);
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString(), adapters: results },
    { status: ok ? 200 : 503 },
  );
}
