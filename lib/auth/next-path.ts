// lib/auth/next-path.ts — the path a person lands on after signing in (Phase 5 Part 5.1).
// `next` comes from the URL, so it is parsed the way the redirect will parse it, not matched as
// text: the URL parser drops tab, CR and LF and reads "\" as "/", so "/\t/evil.com" is another site.

const BASE = "http://self.invalid";

/** `next` as a path on this site, or `fallback` when it would leave the site. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  let dest: URL;
  try {
    dest = new URL(next, BASE);
  } catch {
    return fallback;
  }
  const path = dest.pathname + dest.search;
  // "/.//evil.com" stays on this origin but normalises to "//evil.com", which the next parse leaves by.
  return dest.origin === BASE && !path.startsWith("//") ? path : fallback;
}
