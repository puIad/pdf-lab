// lib/settings/pasted-gate.ts — the check Deep entry points run before calling a model (Part 6.9).

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../db/client.ts";
import { loadExtractionMode, pastedModeRefusal } from "./extraction-mode.ts";

/** Pasted-replies mode: a Deep run through the router would call a model, so answer with the /deep path instead. */
export async function pastedModeResponse(): Promise<NextResponse | null> {
  const mode = await loadExtractionMode(createServiceSupabaseClient()).catch(() => null);
  const refusal = pastedModeRefusal(mode);
  return refusal ? NextResponse.json(refusal, { status: 409 }) : null;
}
