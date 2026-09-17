import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = { ok: true, schemaVersion: 1 };

  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!configured) {
    return NextResponse.json({ ...base, db: { configured: false } });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { count, error } = await supabase
      .from("sources")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({
      ...base,
      db: { configured: true, sources: count ?? 0 },
    });
  } catch {
    // Generic on purpose: never leak connection details or secrets.
    return NextResponse.json(
      { ...base, db: { configured: true, error: "unreachable" } },
      { status: 503 },
    );
  }
}
