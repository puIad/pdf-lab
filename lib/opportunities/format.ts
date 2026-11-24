// lib/opportunities/format.ts — how a stored opportunity format reads on every surface (issue #87).

/** "planner", or "planner (suggested from 3 of 9 competitor listings)"; null = "Not observed". */
export function formatText(format: string | null | undefined, basis?: string | null): string | null {
  return format ? `${format.replace("_", " ")}${basis ? ` (${basis})` : ""}` : null;
}

/** Same text as formatText, with the format name capitalized and the basis left as written (no CSS capitalize). */
export function formatBadge(format: string | null | undefined, basis?: string | null): string | null {
  const text = formatText(format, basis);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : null;
}

/** "planner · suggested" when the format is a guess from competitor listings, else "planner". */
export function suggestedLabel(format: string, basis?: string | null): string {
  return `${format}${basis ? " · suggested" : ""}`;
}
