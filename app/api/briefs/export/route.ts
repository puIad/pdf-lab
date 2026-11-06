import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import { BriefUnavailable, loadBrief, parseBriefSource } from "@/lib/brief";
import { generateBriefDocx, generateBriefMarkdown } from "@/lib/export/brief";

// POST /api/briefs/export { source, format: "md" | "docx", notes? } — Phase 3 Part 3.10 task 4.
// The brief is rebuilt from stored rows; AI notes the page already wrote are sent back and kept only
// when every cite belongs to this brief. No adapter or LLM call happens here.

export const dynamic = "force-dynamic";

function fileName(title: string, ext: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "brief";
  return `pdf-lab-brief-${slug}.${ext}`;
}

export async function POST(req: Request) {
  let body: { source?: unknown; format?: unknown; notes?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }
  if (body.format !== "md" && body.format !== "docx") {
    return NextResponse.json({ error: 'format must be "md" or "docx"' }, { status: 400 });
  }
  try {
    const brief = await loadBrief(createServiceSupabaseClient(), parseBriefSource(body.source), body.notes);
    if (body.format === "md") {
      return new Response(generateBriefMarkdown(brief), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName(brief.title, "md")}"`,
        },
      });
    }
    const docx = await generateBriefDocx(brief);
    return new Response(new Uint8Array(docx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName(brief.title, "docx")}"`,
      },
    });
  } catch (err) {
    if (err instanceof BriefUnavailable) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
