// lib/google/messages.ts: the short codes the callback puts in ?google_error=, and the fixed text the
// brief page shows for each. Kept apart from oauth.ts (node:crypto) so the client can import it.

const TEXT: Record<string, string> = {
  denied: "Google access was not granted.",
  incomplete: "Google did not complete the sign-in.",
  not_configured: "Google Docs is not set up on this server.",
  no_refresh_token: "Google did not return a long-lived token. Remove PDF Lab at myaccount.google.com/permissions and connect again.",
  wrong_scope: "Google granted a different permission than PDF Lab asks for. Nothing was saved.",
  failed: "Could not connect Google Docs. Try again.",
};

/** Fixed text for a callback error code; any other value (a hand-edited URL) gets the generic message. */
export function googleErrorText(code: string): string {
  return Object.hasOwn(TEXT, code) ? TEXT[code] : TEXT.failed;
}
