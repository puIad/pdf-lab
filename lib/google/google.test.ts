// Part 5.4 acceptance: only drive.file is requested; the state is bound to the person and browser; the
// refresh token is stored encrypted; a brief goes up as a converted Google Doc; a revoked or expired
// token, or a missing refresh token, gives a clean error; disconnect revokes at Google and forgets.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  authUrl,
  completeConnect,
  disconnect,
  GOOGLE_SCOPE,
  googleConfig,
  GoogleError,
  newState,
  readState,
  sendDocx,
  type GoogleTokenStore,
} from "./oauth.ts";

const secret = randomBytes(32);
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const cfg = googleConfig("http://localhost:3000", { GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "csecret" });
const REFRESH = "1//refresh-token-value";

function memoryStore(): GoogleTokenStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    async get(u) {
      return rows.get(u) ?? null;
    },
    async put(u, c) {
      rows.set(u, c);
    },
    async remove(u) {
      return rows.delete(u);
    },
  };
}

type Call = { url: string; init: RequestInit };
/** A fetch that answers from a list of [urlPart, status, json] and records every call. */
function mockFetch(answers: Array<[string, number, unknown]>): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const hit = answers.find(([part]) => String(url).includes(part));
    if (!hit) throw new Error(`unexpected request ${String(url)}`);
    return new Response(JSON.stringify(hit[2]), { status: hit[1] });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const ctx = (store: GoogleTokenStore, fetchFn: typeof fetch, userId = USER) => ({ store, secret, userId, cfg, fetchFn });
const form = (c: Call) => new URLSearchParams(String(c.init.body));

async function connected(store: GoogleTokenStore) {
  const { fetchFn } = mockFetch([["/token", 200, { refresh_token: REFRESH, scope: GOOGLE_SCOPE, access_token: "a" }]]);
  await completeConnect(ctx(store, fetchFn), "code-1");
}

describe("consent request", () => {
  it("asks for drive.file and nothing else, with offline access, to the registered callback", () => {
    assert.equal(GOOGLE_SCOPE, "https://www.googleapis.com/auth/drive.file");
    const url = new URL(authUrl(cfg, "s"));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("scope"), GOOGLE_SCOPE);
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/google/callback");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("client_id"), "cid");
    assert.ok(!url.search.includes("csecret"));
  });
  it("needs the client id and secret", () => {
    assert.throws(() => googleConfig("http://x", {}), (e) => e instanceof GoogleError && e.code === "not_configured");
  });
});

describe("state", () => {
  it("returns the path for the same person and browser", () => {
    const { state, nonce } = newState(secret, USER, "/briefs/idea?seed=a");
    assert.equal(readState(secret, state, USER, nonce), "/briefs/idea?seed=a");
  });
  it("refuses another person, another browser, a forged or expired state", () => {
    const { state, nonce } = newState(secret, USER, "/x", 0);
    const bad = (s: string | null, u: string, n: string | null, now: number) =>
      assert.throws(() => readState(secret, s, u, n, now), (e) => e instanceof GoogleError && e.code === "bad_state");
    bad(state, OTHER, nonce, 1);
    bad(state, USER, "other-nonce", 1);
    bad(state, USER, null, 1);
    bad(state.slice(0, -2) + "xx", USER, nonce, 1);
    bad(null, USER, nonce, 1);
    bad(state, USER, nonce, 11 * 60 * 1000);
    const other = newState(randomBytes(32), USER, "/x", 0);
    bad(other.state, USER, other.nonce, 1);
  });
});

describe("connecting", () => {
  it("stores the refresh token encrypted, bound to the person", async () => {
    const store = memoryStore();
    const { fetchFn, calls } = mockFetch([["/token", 200, { refresh_token: REFRESH, scope: GOOGLE_SCOPE, access_token: "a" }]]);
    await completeConnect(ctx(store, fetchFn), "code-1");
    assert.equal(form(calls[0]).get("grant_type"), "authorization_code");
    assert.equal(form(calls[0]).get("code"), "code-1");
    const cipher = store.rows.get(USER)!;
    assert.ok(cipher && !cipher.includes(REFRESH));
    // The same ciphertext under another user's row does not open: sending as OTHER finds the token unreadable.
    store.rows.set(OTHER, cipher);
    await assert.rejects(sendDocx(ctx(store, fetchFn, OTHER), "t", new Uint8Array()), (e) => e instanceof GoogleError && e.code === "not_connected");
    assert.equal(store.rows.has(OTHER), false);
  });
  it("refuses a grant with a missing refresh token and saves nothing", async () => {
    const store = memoryStore();
    const { fetchFn } = mockFetch([["/token", 200, { access_token: "a", scope: GOOGLE_SCOPE }]]);
    await assert.rejects(completeConnect(ctx(store, fetchFn), "c"), (e) => e instanceof GoogleError && e.code === "no_refresh_token");
    assert.equal(store.rows.size, 0);
  });
  it("refuses a grant with any scope beyond drive.file and saves nothing", async () => {
    const store = memoryStore();
    for (const scope of [`${GOOGLE_SCOPE} https://www.googleapis.com/auth/drive`, "openid", undefined]) {
      const { fetchFn } = mockFetch([["/token", 200, { refresh_token: REFRESH, scope }]]);
      await assert.rejects(completeConnect(ctx(store, fetchFn), "c"), (e) => e instanceof GoogleError && e.code === "wrong_scope");
    }
    assert.equal(store.rows.size, 0);
  });
  it("reports a refused code without saving", async () => {
    const store = memoryStore();
    const { fetchFn } = mockFetch([["/token", 400, { error: "invalid_grant", error_description: "Bad Request" }]]);
    await assert.rejects(completeConnect(ctx(store, fetchFn), "c"), (e) => e instanceof GoogleError && e.code === "failed");
    assert.equal(store.rows.size, 0);
  });
});

describe("sending a brief", () => {
  it("uploads the DOCX as a Google Doc and returns its link", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn, calls } = mockFetch([
      ["/token", 200, { access_token: "ya29.access" }],
      ["/upload/drive/v3/files", 200, { id: "doc1", webViewLink: "https://docs.google.com/document/d/doc1/edit" }],
    ]);
    const out = await sendDocx(ctx(store, fetchFn), "My brief", new Uint8Array([80, 75, 3, 4]));
    assert.deepEqual(out, { id: "doc1", url: "https://docs.google.com/document/d/doc1/edit" });
    assert.equal(form(calls[0]).get("grant_type"), "refresh_token");
    assert.equal(form(calls[0]).get("refresh_token"), REFRESH);
    const up = calls[1];
    assert.ok(up.url.includes("uploadType=multipart"));
    assert.equal((up.init.headers as Record<string, string>).Authorization, "Bearer ya29.access");
    const body = Buffer.from(up.init.body as Buffer).toString("latin1");
    assert.match(body, /"mimeType":"application\/vnd\.google-apps\.document"/);
    assert.match(body, /"name":"My brief"/);
    assert.match(body, /Content-Type: application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  });
  it("says to connect when nothing is saved", async () => {
    const { fetchFn, calls } = mockFetch([]);
    await assert.rejects(sendDocx(ctx(memoryStore(), fetchFn), "t", new Uint8Array()), (e) => e instanceof GoogleError && e.code === "not_connected");
    assert.equal(calls.length, 0);
  });
  it("a revoked or expired token gives a clean error and is forgotten, so the next click reconnects", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn } = mockFetch([["/token", 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }]]);
    await assert.rejects(
      sendDocx(ctx(store, fetchFn), "t", new Uint8Array()),
      (e) => e instanceof GoogleError && e.code === "revoked" && /Connect Google Docs again/.test(e.message) && !e.message.includes(REFRESH),
    );
    assert.equal(store.rows.size, 0);
  });
  it("an access token Drive rejects with 401 is treated as revoked", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn } = mockFetch([["/token", 200, { access_token: "a" }], ["/upload/", 401, { error: { message: "Invalid Credentials" } }]]);
    await assert.rejects(sendDocx(ctx(store, fetchFn), "t", new Uint8Array()), (e) => e instanceof GoogleError && e.code === "revoked");
    assert.equal(store.rows.size, 0);
  });
  it("a Drive error keeps the connection and shows Google's reason", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn } = mockFetch([["/token", 200, { access_token: "a" }], ["/upload/", 403, { error: { message: "Drive API has not been used in project" } }]]);
    await assert.rejects(sendDocx(ctx(store, fetchFn), "t", new Uint8Array()), (e) => e instanceof GoogleError && e.code === "failed" && /Drive API has not been used/.test(e.message));
    assert.equal(store.rows.size, 1);
  });
});

describe("disconnecting", () => {
  it("revokes the grant at Google, then forgets the token", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn, calls } = mockFetch([["/revoke", 200, {}]]);
    assert.equal(await disconnect(ctx(store, fetchFn)), true);
    assert.equal(form(calls[0]).get("token"), REFRESH);
    assert.equal(store.rows.size, 0);
  });
  it("treats a token Google already revoked as done", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn } = mockFetch([["/revoke", 400, { error: "invalid_token" }]]);
    assert.equal(await disconnect(ctx(store, fetchFn)), true);
    assert.equal(store.rows.size, 0);
  });
  it("keeps the token when Google does not confirm, so it can be retried", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn } = mockFetch([["/revoke", 500, { error: "backend_error" }]]);
    await assert.rejects(disconnect(ctx(store, fetchFn)), (e) => e instanceof GoogleError && e.code === "failed");
    assert.equal(store.rows.size, 1);
  });
  it("only touches the caller's own row", async () => {
    const store = memoryStore();
    await connected(store);
    const { fetchFn, calls } = mockFetch([]);
    assert.equal(await disconnect(ctx(store, fetchFn, OTHER)), false);
    assert.equal(calls.length, 0);
    assert.equal(store.rows.size, 1);
  });
});
