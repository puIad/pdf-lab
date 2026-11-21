// lib/opportunities/format.ts — how a stored opportunity format reads on every surface (issue #87).

/** "planner", or "planner (suggested from 3 of 9 competitor listings)"; null = "Not observed". */
export function formatText(format: string | null | undefined, basis?: string | null): string | null {
  return format ? `${format.replace("_", " ")}${basis ? ` (${basis})` : ""}` : null;
}
