import { describe, it, expect, beforeEach } from "vitest";
import { buildGateway } from "../src/index";
import { CredentialVault } from "../src/vault/credentials";

describe("ortho32-ai-gateway", () => {
  let ctx: Awaited<ReturnType<typeof buildGateway>>;
  let vault: CredentialVault;

  beforeEach(async () => {
    vault = new CredentialVault();
    // configure all cloud providers with fake keys (vault-mediated)
    await vault.set("anthropic", "sk-ant-fake-123");
    await vault.set("openai", "sk-openai-fake-123");
    await vault.set("meta", "meta-fake-123");
    await vault.set("mistral", "mistral-fake-123");
    await vault.set("bedrock", "aws-fake-123");
    ctx = await buildGateway({ vault });
  });

  it("catalog sync produces ModelDescriptor[]", async () => {
    const models = ctx.catalog.list();
    expect(models.length).toBeGreaterThan(10);
    for (const m of models) {
      expect(m.canonicalID).toBeDefined();
      expect(m.provider).toBeDefined();
      expect(m.providerModelID).toBeDefined();
      expect(m.displayName).toBeDefined();
      expect(m.family).toBeDefined();
      expect(m.version).toBeDefined();
      expect(m.modalities).toBeDefined();
      expect(m.contextWindow).toBeGreaterThan(0);
      expect(typeof m.toolUse).toBe("boolean");
      expect(typeof m.streaming).toBe("boolean");
      expect(typeof m.structuredOutput).toBe("boolean");
      expect(typeof m.embeddings).toBe("boolean");
      expect(typeof m.reasoning).toBe("boolean");
      expect(m.lastSeen).toBeDefined();
    }
  });

  it("coding.default resolves to a model", async () => {
    const res = await ctx.router.routeConverse({
      model: "coding.default",
      messages: [{ role: "user", content: "write hello world in python" }],
    });
    expect(res.provider).toBe("anthropic");
    expect(res.model).toBe("anthropic:claude-3-5-sonnet-20241022");
    expect(res.content).toContain("[anthropic]");
  });

  it("local-only policy stays local even if slow", async () => {
    const res = await ctx.router.routeConverse({
      model: "offline.default",
      messages: [{ role: "user", content: "hello local" }],
      policy: { localOnly: true },
    });
    expect(res.provider).toBe("local");

    await expect(
      ctx.router.routeConverse({
        model: "coding.default",
        messages: [{ role: "user", content: "hi" }],
        policy: { localOnly: true },
      })
    ).rejects.toThrow(/local-only/);
  });

  it("alias update does NOT auto-migrate in-flight requests", async () => {
    // start a slow in-flight request that snapshots alias
    const slowProvider = ctx.providers.get("anthropic") as any;
    const originalConverse = slowProvider.converse.bind(slowProvider);
    slowProvider.converse = async (req: any) => {
      await new Promise((r) => setTimeout(r, 80));
      return originalConverse(req);
    };

    const inFlight = ctx.router.routeConverse({
      model: "fast.default",
      messages: [{ role: "user", content: "in flight" }],
    });

    // update alias mid-flight to point elsewhere
    ctx.aliases.set("fast.default", {
      canonicalID: "openai:gpt-4o-2024-08-06",
      provider: "openai",
      providerModelID: "gpt-4o-2024-08-06",
      version: "2024-08-06",
      updatePolicy: "pin",
    });

    const resFlight = await inFlight;
    // should still be mistral (snapshot), not openai
    expect(resFlight.provider).toBe("mistral");

    // next request should use new alias
    const resNext = await ctx.router.routeConverse({
      model: "fast.default",
      messages: [{ role: "user", content: "after update" }],
    });
    expect(resNext.provider).toBe("openai");
    slowProvider.converse = originalConverse;
  });

  it("credential never appears in response", async () => {
    const res = await ctx.router.routeConverse({
      model: "coding.default",
      messages: [{ role: "user", content: "test credential leakage" }],
    });
    const json = JSON.stringify(res);
    expect(json).not.toContain("sk-ant-fake-123");
    expect(json).not.toContain("sk-openai-fake");
    expect(json).not.toContain("api_key");
  });

  it("usage ledger increments on each call", async () => {
    const before = ctx.ledger.summary().totalRequests;
    await ctx.router.routeConverse({ model: "coding.default", messages: [{ role: "user", content: "one" }] });
    await ctx.router.routeInvoke({ model: "offline.default", prompt: "two" });
    const after = ctx.ledger.summary().totalRequests;
    expect(after).toBe(before + 2);
    expect(ctx.ledger.summary().byAlias["coding.default"].requests).toBeGreaterThan(0);
  });

  it("unavailable alias with policy error throws, not silent fallback", async () => {
    const desc = ctx.catalog.get("anthropic:claude-3-opus-20240229")!;
    ctx.catalog.upsert({ ...desc, availability: "unavailable" });
    ctx.aliases.set("test.unavailable", {
      canonicalID: "anthropic:claude-3-opus-20240229",
      provider: "anthropic",
      providerModelID: "claude-3-opus-20240229",
      version: "20240229",
      updatePolicy: "pin",
    });
    await expect(
      ctx.router.routeConverse({ model: "test.unavailable", messages: [{ role: "user", content: "hi" }], policy: { fallback: "error" } })
    ).rejects.toThrow();
  });
});
