// lib/auth/next-path.test.ts — the sign-in link only ever redirects inside this site.

import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "./next-path.ts";

const ORIGIN = "https://pdflab.example";

test("a path on this site is kept, with its query", () => {
  assert.equal(safeNextPath("/research?mode=deep", "/"), "/research?mode=deep");
  assert.equal(safeNextPath("/account", "/"), "/account");
});

test("a missing value gives the fallback", () => {
  assert.equal(safeNextPath(null, "/account"), "/account");
  assert.equal(safeNextPath(undefined, "/account"), "/account");
  assert.equal(safeNextPath("", "/account"), "/account");
});

test("whatever comes back redirects inside the site", () => {
  const hostile = [
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r\\evil.com",
    "\t//evil.com",
    "/.//evil.com",
    "/./\\evil.com",
    "/x/..//evil.com",
    "https://evil.com/",
    "javascript:alert(1)",
    "evil.com",
    "http://[",
  ];
  for (const next of hostile) {
    const path = safeNextPath(next, "/");
    assert.equal(new URL(path, ORIGIN).origin, ORIGIN, JSON.stringify(next));
    assert.match(path, /^\/(?!\/)/, JSON.stringify(next));
  }
});
