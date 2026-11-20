// lib/settings/pasted-gate.ts — the check Deep entry points run before calling a model (Part 6.9).

import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../db/client.ts";
import { extractionPin, loadExtractionMode, pastedModeRefusal } from "./extraction-mode.ts";

/** Pasted-replies mode: a Deep run through the router would call a model, so answer with the /deep path instead. */
export async function pastedModeResponse(): Promise<NextResponse | null> {
  const mode = await loadExtractionMode(createServiceSupabaseClient()).catch(() => null);
  const refusal = pastedModeRefusal(mode);
  return refusal ? NextResponse.json(refusal, { status: 409 }) : null;
}

/** For a route that extracts directly: the saved mode as a 409 (pasted) or the pin for the job (model). */
export async function extractionModeGate(): Promise<{ response: NextResponse | null; pin: { providerName?: string; model?: string } }> {
  const mode = await loadExtractionMode(createServiceSupabaseClient()).catch(() => null);
  const refusal = pastedModeRefusal(mode);
  return { response: refusal ? NextResponse.json(refusal, { status: 409 }) : null, pin: extractionPin(mode) };
}
