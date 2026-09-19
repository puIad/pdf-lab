// lib/evidence/types.ts — Normative Evidence types per docs/04-SCHEMA.md & docs/06-EVIDENCE-CONTRACT.md.

export type EntityType = "market" | "opportunity" | "trend" | "competition";

export type SignalType =
  | "pain_point"
  | "buyer_intent"
  | "urgency"
  | "pdf_fit"
  | "trend_signal"
  | "competition_observed"
  | "frequency"
  | "general";

export interface EvidenceInput {
  entityType: EntityType;
  entityId: string;
  sourceId?: string | null;
  claim: string;
  excerpt?: string | null;
  url?: string | null;
  signalType?: SignalType | string;
  confidence?: number;
  createdAt?: string | null;
}

export interface EvidenceRow {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  source_id: string | null;
  claim: string;
  excerpt: string | null;
  url: string | null;
  created_at: string;
}

export function formatEvidenceClaim(
  claim: string,
  signalType?: string,
  confidence?: number,
): string {
  const parts: string[] = [];
  if (signalType) parts.push(`type: ${signalType}`);
  if (typeof confidence === "number") parts.push(`conf: ${confidence.toFixed(2)}`);
  if (parts.length === 0) return claim.trim();
  if (claim.trim().startsWith("[")) return claim.trim();
  return `[${parts.join(" | ")}] ${claim.trim()}`;
}

export function parseEvidenceClaim(claim: string): {
  rawClaim: string;
  signalType?: string;
  confidence?: number;
} {
  const match = claim.match(/^\[(.*?)\]\s*(.*)$/);
  if (!match) return { rawClaim: claim };
  const metaStr = match[1];
  const rawClaim = match[2];
  let signalType: string | undefined;
  let confidence: number | undefined;

  const pairs = metaStr.split("|").map((p) => p.trim());
  for (const pair of pairs) {
    const [k, v] = pair.split(":").map((s) => s.trim());
    if (k === "type" && v) signalType = v;
    if (k === "conf" && v) {
      const num = parseFloat(v);
      if (!Number.isNaN(num)) confidence = num;
    }
  }
  return { rawClaim, signalType, confidence };
}
