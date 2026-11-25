// lib/google/oauth.ts: "Send to Google Docs" (Phase 5 Part 5.4, PRD §46). PDF Lab's own Google OAuth
// client, the drive.file scope only (PDF Lab sees just the files it creates), the web server flow with
// offline access. Only the refresh token is stored, encrypted per person like the provider keys of
// Part 5.2 (lib/keys/crypto.ts); an access token lives for one request. Pure over an injected fetch and
// a token store, so the flow is tested against mocked Google answers.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptKey, encryptKey } from "../keys/crypto.ts";

/** The only scope ever requested. Non-sensitive in Google's classification: no sensitive-scope review. */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Binds the stored ciphertext to this use, like a provider name does for Part 5.2 keys. */
const TOKEN_PURPOSE = "google-drive";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";
const GOOGLE_DOC = "application/vnd.google-apps.document";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const STATE_TTL_MS = 10 * 60 * 1000;

export type GoogleErrorCode = "not_configured" | "not_connected" | "revoked" | "bad_state" | "no_refresh_token" | "wrong_scope" | "failed";

/** An error whose message is safe to show to the person. */
export class GoogleError extends Error {
  readonly code: GoogleErrorCode;
  constructor(code: GoogleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Ciphertext of one person's refresh token. Every method is scoped to one user. */
export interface GoogleTokenStore {
  get(userId: string): Promise<string | null>;
  /** Insert or replace the row for the user. */
  put(userId: string, ciphertext: string): Promise<void>;
  remove(userId: string): Promise<boolean>;
}

const CALLBACK_PATH = "/api/google/callback";
/** Cookie holding the state nonce, scoped to the Google routes. */
export const NONCE_COOKIE = "google_oauth_nonce";

export function googleConfig(origin: string, env: Record<string, string | undefined> = process.env): GoogleConfig {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GoogleError("not_configured", "Google Docs is not set up on this server.");
  return { clientId, clientSecret, redirectUri: `${origin}${CALLBACK_PATH}` };
}

// ---- state: the CSRF check, bound to the person and to the browser that started the flow ----

interface StatePayload {
  userId: string;
  nonce: string;
  next: string;
  exp: number;
}

const sign = (secret: Buffer, body: string) => createHmac("sha256", secret).update(`google-oauth-state:${body}`).digest("base64url");

/** A signed state naming the person and where to return to. The caller also sets the nonce as a cookie. */
export function newState(secret: Buffer, userId: string, next: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const body = Buffer.from(JSON.stringify({ userId, nonce, next, exp: now + STATE_TTL_MS } satisfies StatePayload)).toString("base64url");
  return { state: `${body}.${sign(secret, body)}`, nonce };
}

/** The path to return to, once the state is genuine, unexpired, this person's, and this browser's (cookie nonce). */
export function readState(secret: Buffer, state: string | null, userId: string, cookieNonce: string | null, now = Date.now()): string {
  const [body, mac] = (state ?? "").split(".");
  const bad = () => new GoogleError("bad_state", "The Google sign-in expired or did not start here. Try again.");
  if (!body || !mac) throw bad();
  const want = Buffer.from(sign(secret, body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw bad();
  let p: StatePayload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    throw bad();
  }
  if (p.userId !== userId || !cookieNonce || p.nonce !== cookieNonce || p.exp < now) throw bad();
  return p.next;
}

// ---- Google calls ----

export function authUrl(cfg: GoogleConfig, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    // offline gives a refresh token; consent makes Google return one again after a revoke and reconnect.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenCall(cfg: GoogleConfig, params: Record<string, string>, fetchFn: typeof fetch): Promise<{ ok: boolean; body: TokenAnswer }> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
  });
  return { ok: res.ok, body: ((await res.json().catch(() => ({}))) ?? {}) as TokenAnswer };
}

const describe = (b: TokenAnswer) => b.error_description ?? b.error ?? "no reason given";

/** Trade the callback code for a refresh token. Refuses any grant that is not exactly drive.file. */
async function exchangeCode(cfg: GoogleConfig, code: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const { ok, body } = await tokenCall(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }, fetchFn);
  if (!ok) throw new GoogleError("failed", `Google refused the sign-in: ${describe(body)}.`);
  if (body.scope?.split(" ").filter(Boolean).join(" ") !== GOOGLE_SCOPE) {
    throw new GoogleError("wrong_scope", "Google granted a different permission than PDF Lab asks for. Nothing was saved.");
  }
  if (!body.refresh_token) {
    throw new GoogleError("no_refresh_token", "Google did not return a long-lived token. Remove PDF Lab at myaccount.google.com/permissions and connect again.");
  }
  return body.refresh_token;
}

async function accessToken(cfg: GoogleConfig, refreshToken: string, fetchFn: typeof fetch): Promise<string> {
  const { ok, body } = await tokenCall(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn);
  // invalid_grant: the person revoked access, or the token expired (a consent screen in Testing mode expires them after 7 days).
  if (body.error === "invalid_grant") throw new GoogleError("revoked", "Google access was removed or expired. Connect Google Docs again.");
  if (!ok || !body.access_token) throw new GoogleError("failed", `Google refused to renew access: ${describe(body)}.`);
  return body.access_token;
}

/** files.create, multipart: the DOCX with a Google Doc target type, which Drive converts on import. */
async function uploadAsDoc(token: string, name: string, docx: Uint8Array, fetchFn: typeof fetch): Promise<{ id: string; url: string }> {
  const boundary = `pdflab${randomBytes(12).toString("hex")}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: GOOGLE_DOC })}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${DOCX}\r\n\r\n`),
    docx,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetchFn(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (res.status === 401) throw new GoogleError("revoked", "Google access was removed or expired. Connect Google Docs again.");
  if (!res.ok || !json.id || !json.webViewLink) throw new GoogleError("failed", `Google Drive refused the upload: ${json.error?.message ?? `HTTP ${res.status}`}.`);
  return { id: json.id, url: json.webViewLink };
}

/** Google answers 400 invalid_token for a token that is already revoked: the goal is met. */
async function revokeAtGoogle(refreshToken: string, fetchFn: typeof fetch): Promise<void> {
  const res = await fetchFn(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as TokenAnswer;
  if (body.error !== "invalid_token") throw new GoogleError("failed", `Google did not confirm the disconnect: ${describe(body)}.`);
}

// ---- flows over the store ----

interface Ctx {
  store: GoogleTokenStore;
  secret: Buffer;
  userId: string;
  cfg: GoogleConfig;
  fetchFn?: typeof fetch;
}

/** The person's refresh token, or null when none is saved or the vault cannot read it (the row is kept: a wrong KEY_VAULT_SECRET must not wipe tokens; a reconnect replaces it). */
async function savedToken(c: Ctx): Promise<string | null> {
  const cipher = await c.store.get(c.userId);
  if (!cipher) return null;
  try {
    return decryptKey(c.secret, c.userId, TOKEN_PURPOSE, cipher);
  } catch {
    console.error("a stored Google token could not be decrypted; it is kept and ignored");
    return null;
  }
}

/** Callback step: code in, encrypted refresh token saved for this person (a reconnect replaces the old one). */
export async function completeConnect(c: Ctx, code: string): Promise<void> {
  const refresh = await exchangeCode(c.cfg, code, c.fetchFn);
  await c.store.put(c.userId, encryptKey(c.secret, c.userId, TOKEN_PURPOSE, refresh));
}

/** Upload the DOCX as an editable Google Doc in the person's Drive. A refused token is removed so the next click reconnects. */
export async function sendDocx(c: Ctx, name: string, docx: Uint8Array): Promise<{ id: string; url: string }> {
  const refresh = await savedToken(c);
  if (!refresh) throw new GoogleError("not_connected", "Connect Google Docs first.");
  const f = c.fetchFn ?? fetch;
  try {
    return await uploadAsDoc(await accessToken(c.cfg, refresh, f), name, docx, f);
  } catch (err) {
    if (err instanceof GoogleError && err.code === "revoked") await c.store.remove(c.userId);
    throw err;
  }
}

/** Revoke the grant at Google, then forget the token. A failed revoke keeps the token so it can be retried. */
export async function disconnect(c: Ctx): Promise<boolean> {
  const refresh = await savedToken(c);
  if (!refresh) return c.store.remove(c.userId);
  await revokeAtGoogle(refresh, c.fetchFn ?? fetch);
  await c.store.remove(c.userId);
  return true;
}
