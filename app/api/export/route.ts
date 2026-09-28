// app/api/export/route.ts — Phase 2 Part 2.4 API endpoint.
// Exports full evidence-backed PDF LAB report as Markdown, CSV (RFC 4180), or JSON.

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/db/client";
import {
  fetchReportExportData,
  generateReportMarkdown,
  generateReportCsv,
  generateReportJson,
  type ExportFormat,
} from "@/lib/export/index";

export const dynamic = "force-dynamic";

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "report";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const marketId = url.searchParams.get("market_id") || undefined;
  const runId = url.searchParams.get("run_id") || undefined;
  const query = url.searchParams.get("query") || undefined;
  const format = (url.searchParams.get("format") || "json").toLowerCase() as ExportFormat;
  const download = url.searchParams.get("download") !== "false";

  if (!["markdown", "csv", "json"].includes(format)) {
    return NextResponse.json(
      { error: "Invalid format. Supported formats: 'markdown', 'csv', 'json'." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();

  try {
    const reportData = await fetchReportExportData(supabase, {
      marketId,
      runId,
      query,
    });

    const fileSlug = sanitizeFilename(reportData.market.name || reportData.query);

    switch (format) {
      case "markdown": {
        const md = generateReportMarkdown(reportData);
        return new Response(md, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            ...(download
              ? { "Content-Disposition": `attachment; filename="pdf-lab-${fileSlug}.md"` }
              : {}),
          },
        });
      }

      case "csv": {
        const csv = generateReportCsv(reportData);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            ...(download
              ? { "Content-Disposition": `attachment; filename="pdf-lab-${fileSlug}-opportunities.csv"` }
              : {}),
          },
        });
      }

      case "json":
      default: {
        const jsonStr = generateReportJson(reportData);
        return new Response(jsonStr, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...(download
              ? { "Content-Disposition": `attachment; filename="pdf-lab-${fileSlug}.json"` }
              : {}),
          },
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function POST(req: Request) {
  let body: {
    market_id?: string;
    run_id?: string;
    query?: string;
    format?: ExportFormat;
    download?: boolean;
  } = {};

  try {
    body = (await req.json()) as typeof body;
  } catch {
    // defaults
  }

  const format = (body.format || "json").toLowerCase() as ExportFormat;
  if (!["markdown", "csv", "json"].includes(format)) {
    return NextResponse.json(
      { error: "Invalid format. Supported formats: 'markdown', 'csv', 'json'." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();

  try {
    const reportData = await fetchReportExportData(supabase, {
      marketId: body.market_id,
      runId: body.run_id,
      query: body.query,
    });

    const fileSlug = sanitizeFilename(reportData.market.name || reportData.query);
    const download = body.download === true || String(body.download).toLowerCase() === "true";

    switch (format) {
      case "markdown": {
        const md = generateReportMarkdown(reportData);
        return new Response(md, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            ...(download
              ? { "Content-Disposition": `attachment; filename="pdf-lab-${fileSlug}.md"` }
              : {}),
          },
        });
      }

      case "csv": {
        const csv = generateReportCsv(reportData);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            ...(download
              ? { "Content-Disposition": `attachment; filename="pdf-lab-${fileSlug}-opportunities.csv"` }
              : {}),
          },
        });
      }

      case "json":
      default: {
        const jsonStr = generateReportJson(reportData);
        return new Response(jsonStr, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...(download
              ? { "Content-Disposition": `attachment; filename="pdf-lab-${fileSlug}.json"` }
              : {}),
          },
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
