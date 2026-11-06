import { NextResponse } from "next/server";
import { getServiceDeps } from "@/lib/ingest/service-deps";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { loadCompetitionChecks, normalizePhrase, runCompetitionCheck } from "@/lib/competition/check";

// POST /api/ideas/competition { phrase } — Phase 3 Part 3.9: one click = one check (3 Serper calls,
// Etsy / Gumroad / KDP). Listings are stored as `competition` evidence and the response is read back
// from those rows. Open in local dev; in production it needs the internal key until Phase 5 auth.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const key = process.env.INTERNAL_API_KEY;
    if (!key || req.headers.get("x-api-key") !== key) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let phrase: unknown;
  try {
    phrase = ((await req.json()) as { phrase?: unknown } | null)?.phrase;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (typeof phrase !== "string" || normalizePhrase(phrase).length < 2 || phrase.length > 160) {
    return NextResponse.json({ error: "phrase must be a 2 to 160 character string" }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const run = await runCompetitionCheck(phrase, {
      ...getServiceDeps(),
      // A check reports listings as they are now: refresh price and stars on rows stored earlier.
      upsertSignals: async (rows) => {
        const { data, error } = await supabase.from("signals").upsert(rows, { onConflict: "source_id,external_id" }).select("id");
        if (error) throw new Error(`signals upsert failed: ${error.message}`);
        return data?.length ?? 0;
      },
      replaceEvidence: async (entityId, rows) => {
        const { data, error } = await supabase.from("evidence").insert(rows).select("id");
        if (error) throw new Error(`failed to store competition evidence: ${error.message}`);
        const keep = (data ?? []).map((r: { id: string }) => r.id);
        const { error: delErr } = await supabase
          .from("evidence")
          .delete()
          .eq("entity_type", "competition")
          .eq("entity_id", entityId)
          .not("id", "in", `(${keep.join(",")})`);
        if (delErr) throw new Error(`failed to replace the previous check: ${delErr.message}`);
      },
    });
    if (!run.sources.some((s) => s.status === "ok")) {
      const reason = run.sources.map((s) => `${s.key}: ${s.status}${s.error ? ` (${s.error})` : ""}`).join("; ");
      return NextResponse.json({ error: `No marketplace answered, nothing stored. ${reason}`, sources: run.sources }, { status: 502 });
    }
    const check = (await loadCompetitionChecks(supabase, [phrase]))[normalizePhrase(phrase)] ?? null;
    return NextResponse.json({ check, sources: run.sources });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
