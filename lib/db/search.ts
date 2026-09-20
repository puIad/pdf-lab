// lib/db/search.ts — Safe PostgREST filter builder for text queries.
// Sanitizes user input to avoid syntax errors in PostgREST `.or(...)`
// (e.g. commas, parentheses, quotes) and expands multi-word terms.

export function buildSearchFilter(query: string): string {
  // Strip PostgREST special control characters that break `.or(...)` syntax
  const sanitized = query.replace(/[,()"\\]/g, " ").trim();
  if (!sanitized) return "";

  const escapedFull = sanitized.replace(/[%_]/g, (c) => `\\${c}`);
  const conditions = [
    `title.ilike.%${escapedFull}%`,
    `content.ilike.%${escapedFull}%`,
  ];

  // Also include individual keywords (length >= 2) so phrases with intervening words still match
  const words = sanitized.split(/\s+/).filter((w) => w.length >= 2);
  for (const word of words) {
    if (word.toLowerCase() === sanitized.toLowerCase()) continue;
    const escapedWord = word.replace(/[%_]/g, (c) => `\\${c}`);
    conditions.push(
      `title.ilike.%${escapedWord}%`,
      `content.ilike.%${escapedWord}%`,
    );
  }

  return conditions.join(",");
}
