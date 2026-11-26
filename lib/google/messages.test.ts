import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleErrorText } from "./messages.ts";

describe("callback error codes", () => {
  it("maps each known code to fixed text", () => {
    assert.equal(googleErrorText("denied"), "Google access was not granted.");
    assert.match(googleErrorText("no_refresh_token"), /myaccount\.google\.com\/permissions/);
  });
  it("shows only the generic message for an unknown or hand-written code", () => {
    for (const code of ["<b>hi</b>", "Send money to x", "__proto__", "toString", ""]) {
      assert.equal(googleErrorText(code), googleErrorText("failed"), code);
    }
  });
});
