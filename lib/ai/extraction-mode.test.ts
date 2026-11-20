// lib/ai/extraction-mode.test.ts — the extraction mode: parsing, candidates, the response test.
// Zero network: fake providers only.

import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIRouter } from "./router.ts";
import { candidateModels, checkModeForSave, parseExtractionMode, testModel } from "./extraction-mode.ts";
import { pastedModeRefusal } from "../settings/extraction-mode.ts";
import { canManageSettings } from "../settings/access.ts";
import type { AIProvider, ChatRequest } from "./types.ts";

function provider(name: string, respond: (req: ChatRequest) => Promise<string> | string): AIProvider & { seen: ChatRequest[] } {
  const seen: ChatRequest[] = [];
  return {
    name,
    seen,
    isConfigured: true,
    async chatComplete(req) {
      seen.push(req);
      const content = await respond(req);
      return { content, model: req.model, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
    },
    async healthCheck() {
      return { ok: true };
    },
  };
}

function routerWith(...ps: AIProvider[]): AIRouter {
  const r = new AIRouter({} as NodeJS.ProcessEnv);
  ps.forEach((p) => r.register(p));
  return r;
}

describe("parseExtractionMode", () => {
  it("accepts pasted and model modes, rejects the rest", () => {
    assert.deepEqual(parseExtractionMode({ kind: "pasted" }), { kind: "pasted" });
    assert.deepEqual(parseExtractionMode({ kind: "model", provider: " nvidia ", model: "m" }), { kind: "model", provider: "nvidia", model: "m" });
    assert.equal(parseExtractionMode({ kind: "model", provider: "nvidia" }), null);
    assert.equal(parseExtractionMode({ kind: "model", provider: "", model: "m" }), null);
    assert.equal(parseExtractionMode("pasted"), null);
    assert.equal(parseExtractionMode(null), null);
  });
});

describe("candidateModels", () => {
  it("lists only configured providers and adds the env model once", () => {
    const list = candidateModels(["nvidia"], ({ NVIDIA_CHEAP_MODEL: "x/custom" } as unknown as NodeJS.ProcessEnv));
    assert.ok(list.every((c) => c.provider === "nvidia"));
    assert.ok(list.some((c) => c.model === "x/custom"));
    assert.equal(candidateModels(["nvidia"], ({ NVIDIA_CHEAP_MODEL: "nvidia/nemotron-3.5-bolt-e4b" } as unknown as NodeJS.ProcessEnv)).length, 2);
    assert.deepEqual(candidateModels([], {} as NodeJS.ProcessEnv), []);
  });
});

describe("testModel", () => {
  it("reports an answering model with its time", async () => {
    const p = provider("nvidia", () => "ok");
    const res = await testModel(routerWith(p), { provider: "nvidia", model: "m1" });
    assert.equal(res.answered, true);
    assert.equal(res.reply, "ok");
    assert.equal(p.seen[0].model, "m1");
  });

  it("reports a throwing, empty or slow model as not answering", async () => {
    const boom = provider("a", () => {
      throw new Error("HTTP 410");
    });
    assert.match((await testModel(routerWith(boom), { provider: "a", model: "m" })).error ?? "", /410/);
    const empty = provider("b", () => "  ");
    assert.equal((await testModel(routerWith(empty), { provider: "b", model: "m" })).answered, false);
    const slow = provider("c", () => new Promise<string>((r) => setTimeout(() => r("ok"), 200)));
    const res = await testModel(routerWith(slow), { provider: "c", model: "m" }, 20);
    assert.equal(res.answered, false);
    assert.match(res.error ?? "", /no answer/);
  });

  it("does not fall back to another provider's model", async () => {
    const dead = provider("nvidia", () => {
      throw new Error("down");
    });
    const other = provider("ollama", () => "ok");
    const res = await testModel(routerWith(dead, other), { provider: "nvidia", model: "m" });
    assert.equal(res.answered, false);
    assert.equal(other.seen.length, 0);
  });

  it("refuses an unconfigured provider without a call", async () => {
    const res = await testModel(routerWith(provider("a", () => "ok")), { provider: "zzz", model: "m" });
    assert.equal(res.answered, false);
    assert.match(res.error ?? "", /not configured/);
  });
});

describe("checkModeForSave", () => {
  it("lets pasted through and blocks a model that did not answer", async () => {
    const dead = provider("nvidia", () => "");
    const r = routerWith(dead);
    assert.deepEqual(await checkModeForSave(r, { kind: "pasted" }), { ok: true });
    const bad = await checkModeForSave(r, { kind: "model", provider: "nvidia", model: "m" });
    assert.equal(bad.ok, false);
    assert.equal(dead.seen.length, 1);
    const good = await checkModeForSave(routerWith(provider("nvidia", () => "ok")), { kind: "model", provider: "nvidia", model: "m" });
    assert.equal(good.ok, true);
  });
});

describe("router pinned model", () => {
  it("generateObject sends the pinned model to the pinned provider", async () => {
    const p = provider("nvidia", () => '{"a":1}');
    const res = await routerWith(p, provider("ollama", () => "{}")).generateObject({
      tier: "cheap",
      system: "s",
      user: "u",
      validate: (x) => x,
      providerName: "nvidia",
      model: "pinned/model",
    });
    assert.equal(p.seen[0].model, "pinned/model");
    assert.equal(res.model, "pinned/model");
  });
});

describe("pinned model with a person's own keys", () => {
  const pin = { tier: "cheap" as const, system: "s", user: "u", providerName: "openrouter", model: "pinned/m" };

  it("tries their key for the same provider first, with the pinned model", async () => {
    const hosted = provider("openrouter", () => "hosted");
    const mine = provider("byok-openrouter", () => "mine");
    const r = routerWith(hosted);
    r.registerByok(mine, "their/own-model");
    const res = await r.generateText(pin);
    assert.equal(res.provider, "byok-openrouter");
    assert.equal(res.keySource, "byok");
    assert.equal(mine.seen[0].model, "pinned/m");
    assert.equal(hosted.seen.length, 0);
  });

  it("falls to the hosted provider when their key fails, and ignores their keys for other providers", async () => {
    const hosted = provider("openrouter", () => "hosted");
    const mine = provider("byok-openrouter", () => {
      throw new Error("HTTP 500");
    });
    const other = provider("byok-gemini", () => "gemini");
    const r = routerWith(hosted);
    r.registerByok(mine);
    r.registerByok(other);
    const res = await r.generateText(pin);
    assert.equal(res.provider, "openrouter");
    assert.equal(other.seen.length, 0);
    assert.equal(hosted.seen[0].model, "pinned/m");
  });
});

describe("pastedModeRefusal and canManageSettings", () => {
  it("refuses only in pasted mode", () => {
    assert.equal(pastedModeRefusal(null), null);
    assert.equal(pastedModeRefusal({ kind: "model", provider: "a", model: "b" }), null);
    assert.equal(pastedModeRefusal({ kind: "pasted" })?.deepPath, "/deep");
  });

  it("lets the server key, a dev server and the owner email manage settings", () => {
    const c = (plan: string, email: string | null = null) => ({ plan, userId: null, anonHash: null, email }) as never;
    assert.equal(canManageSettings(c("internal"), undefined), true);
    assert.equal(canManageSettings(c("local"), undefined), true);
    assert.equal(canManageSettings(c("free", "Me@x.io"), "me@x.io"), true);
    assert.equal(canManageSettings(c("free", "other@x.io"), "me@x.io"), false);
    assert.equal(canManageSettings(c("free", "me@x.io"), undefined), false);
    assert.equal(canManageSettings(c("anon"), "me@x.io"), false);
  });
});

describe("/api/runs gate", () => {
  it("runs the pasted-mode gate for every mode, before any run starts", () => {
    const src = readFileSync(new URL("../../app/api/runs/route.ts", import.meta.url), "utf8");
    const gate = src.indexOf("await pastedModeResponse()");
    assert.ok(gate > 0, "route calls the gate");
    assert.ok(gate < src.indexOf("createServerOrchestratorDeps("), "gate runs before the run is built");
    assert.ok(!/if \(mode === "deep"\)[^}]*pastedModeResponse/.test(src), "gate is not limited to deep");
  });
});
