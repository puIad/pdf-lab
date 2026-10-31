// lib/ai/router.test.ts — tier resolution, fallback, JSON retry. Zero
// network: fake providers only. Run: `pnpm test` (node:test, no deps).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AIRouter, extractJsonSlice } from "./router.ts";
import { NVIDIA_DEFAULT_CHAT_MODEL, OpenAICompatProvider, nvidiaConfigFromEnv } from "./providers/openai-compatible.ts";
import type { AIProvider, ChatRequest, ChatResponse, ProviderHealth } from "./types.ts";

function fakeProvider(
  name: string,
  opts: {
    configured?: boolean;
    healthy?: boolean;
    respond?: (req: ChatRequest) => string | Error;
  } = {},
): AIProvider & { calls: number } {
  const p = {
    name,
    calls: 0,
    get isConfigured() {
      return opts.configured ?? true;
    },
    async chatComplete(req: ChatRequest): Promise<ChatResponse> {
      p.calls++;
      const out = opts.respond ? opts.respond(req) : `{"ok":true}`;
      if (out instanceof Error) throw out;
      return {
        content: out,
        model: `${name}-model`,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCostUsd: 0 },
      };
    },
    async healthCheck(): Promise<ProviderHealth> {
      return (opts.healthy ?? true)
        ? { ok: true, detail: "fake healthy" }
        : { ok: false, detail: "fake down" };
    },
  };
  return p;
}

describe("AIRouter.resolveTier", () => {
  it("defaults cheap tier to ollama (local-first per 07-AI-ROUTER)", () => {
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    router.register(fakeProvider("ollama"));
    router.register(fakeProvider("openrouter"));
    const sel = router.resolveTier("cheap");
    assert.equal(sel.provider, "ollama");
    assert.equal(sel.fallbackFrom, undefined);
  });

  it("honors AI_CHEAP_PROVIDER pin and falls back past unconfigured providers", () => {
    const router = new AIRouter({ AI_CHEAP_PROVIDER: "openrouter" } as unknown as NodeJS.ProcessEnv);
    router.register(fakeProvider("ollama", { configured: false }));
    router.register(fakeProvider("openrouter"));
    const sel = router.resolveTier("cheap");
    assert.equal(sel.provider, "openrouter");
  });

  it("throws when nothing is configured", () => {
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    router.register(fakeProvider("openrouter", { configured: false }));
    assert.throws(() => router.resolveTier("cheap"), /no configured AI provider/);
  });
});

describe("AIRouter.generateText fallback", () => {
  it("falls through to the next configured provider when the first fails", async () => {
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    const down = fakeProvider("ollama", { respond: () => new Error("connection refused") });
    const up = fakeProvider("openrouter");
    router.register(down);
    router.register(up);
    const res = await router.generateText({ tier: "cheap", system: "s", user: "u" });
    assert.equal(res.provider, "openrouter");
    assert.equal(res.fallbackFrom, "ollama");
    assert.equal(down.calls, 1);
    assert.equal(up.calls, 1);
  });
});

describe("AIRouter.generateObject", () => {
  it("retries once after invalid JSON then validates", async () => {
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    let n = 0;
    router.register(
      fakeProvider("openrouter", {
        respond: () => (++n === 1 ? "Sure! Here you go (not json)" : '```json\n{"intent":"strong"}\n```'),
      }),
    );
    const res = await router.generateObject({
      tier: "cheap",
      system: "s",
      user: "u",
      validate: (raw) => {
        assert.deepEqual(raw, { intent: "strong" });
        return raw as { intent: string };
      },
    });
    assert.deepEqual(res.object, { intent: "strong" });
    assert.equal(res.attempts, 2);
    assert.equal(res.usage.totalTokens, 30); // summed across attempts
  });

  it("throws after two invalid replies (caller records failure, writes nothing)", async () => {
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    router.register(fakeProvider("openrouter", { respond: () => "nope, prose only" }));
    await assert.rejects(
      () =>
        router.generateObject({ tier: "cheap", system: "s", user: "u", validate: (r) => r }),
      /invalid JSON\/object twice/,
    );
  });
});

describe("extractJsonSlice", () => {
  it("strips fences and leading prose", () => {
    assert.equal(extractJsonSlice('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(extractJsonSlice('Here is the object: {"a":1} hope it helps'), '{"a":1}');
    assert.equal(extractJsonSlice('{"a":1}'), '{"a":1}');
  });
});

describe("NVIDIA provider (DEC-013)", () => {
  it("nvidia comes before openrouter, and openrouter still serves when no NVIDIA key is set", () => {
    const withKey = new AIRouter({} as NodeJS.ProcessEnv);
    withKey.register(fakeProvider("ollama", { configured: false }));
    withKey.register(fakeProvider("openrouter"));
    withKey.register(fakeProvider("nvidia"));
    assert.equal(withKey.resolveTier("cheap").provider, "nvidia");
    assert.deepEqual([withKey.resolveTier("strong").provider, withKey.resolveTier("strong").model], ["nvidia", NVIDIA_DEFAULT_CHAT_MODEL]);

    const noKey = new AIRouter({} as NodeJS.ProcessEnv);
    noKey.register(fakeProvider("ollama", { configured: false }));
    noKey.register(fakeProvider("openrouter"));
    noKey.register(fakeProvider("nvidia", { configured: false }));
    assert.equal(noKey.resolveTier("strong").provider, "openrouter");
  });

  it("fallback health checks are cached, so they do not add a request per call", async () => {
    let checks = 0;
    const ollama = fakeProvider("ollama", { respond: () => new Error("ECONNREFUSED") });
    const nvidia = fakeProvider("nvidia");
    nvidia.healthCheck = async () => {
      checks++;
      return { ok: true, detail: "ok" };
    };
    const router = new AIRouter({} as NodeJS.ProcessEnv);
    router.register(ollama);
    router.register(nvidia);
    for (let i = 0; i < 3; i++) await router.generateText({ tier: "cheap", system: "s", user: "u" });
    assert.equal(nvidia.calls, 3);
    assert.equal(checks, 1);
  });

  function recorder(statuses: number[]) {
    const calls: Array<{ at: number; body: Record<string, unknown> }> = [];
    const fetchFn = async (_url: string | URL, init?: RequestInit) => {
      calls.push({ at: Date.now(), body: JSON.parse(String(init?.body)) });
      const status = statuses.shift() ?? 200;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status,
        headers: status === 429 ? { "retry-after": "0.05" } : {},
      });
    };
    return { calls, fetchFn };
  }
  const req = { model: "m", system: "s", user: "u" };

  it("spaces request starts by the rate-limit interval and sends reasoning_effort", async () => {
    const { calls, fetchFn } = recorder([]);
    const cfg = { ...nvidiaConfigFromEnv({ NVIDIA_API_KEY: "test", NVIDIA_RPM: "600" } as unknown as NodeJS.ProcessEnv), fetchFn };
    const p = new OpenAICompatProvider(cfg);
    assert.equal(p.name, "nvidia");
    assert.equal(cfg.minIntervalMs, 100);
    await Promise.all([p.chatComplete(req), p.chatComplete(req), p.chatComplete(req)]);
    assert.ok(calls[2].at - calls[0].at >= 190, `gap ${calls[2].at - calls[0].at} ms`);
    assert.equal(calls[0].body.reasoning_effort, "low");
  });

  it("retries once on 429, then gives up", async () => {
    const once = recorder([429]);
    await new OpenAICompatProvider({ name: "nvidia", apiKey: "t", baseUrl: "x", fetchFn: once.fetchFn }).chatComplete(req);
    assert.equal(once.calls.length, 2);
    const twice = recorder([429, 429]);
    await assert.rejects(
      new OpenAICompatProvider({ name: "nvidia", apiKey: "t", baseUrl: "x", fetchFn: twice.fetchFn }).chatComplete(req),
      /HTTP 429/,
    );
    assert.equal(twice.calls.length, 2);
  });

  it("the plain openai-compatible provider keeps its name and sends no reasoning_effort", async () => {
    const { calls, fetchFn } = recorder([]);
    const p = new OpenAICompatProvider({ apiKey: "t", baseUrl: "x", fetchFn });
    await p.chatComplete(req);
    assert.equal(p.name, "openai-compatible");
    assert.equal("reasoning_effort" in calls[0].body, false);
  });
});
