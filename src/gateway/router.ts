import { ModelCatalogService, ModelDescriptor } from "./catalog";
import { ModelAliases } from "./aliases";
import { PolicyEngine, RoutingPolicy } from "./policy";
import type { ORTHOModelProvider, ConverseRequestInternal, InvokeRequestInternal } from "../providers/base";
import { CredentialVault } from "../vault/credentials";
import { UsageLedger } from "../ledger/usage";
import { HealthMonitor } from "../health/monitor";

export type RouteRequest = {
  model: string; // alias or canonicalID
  policy?: RoutingPolicy;
};

export class ModelRouter {
  constructor(
    private catalog: ModelCatalogService,
    private aliases: ModelAliases,
    private policy: PolicyEngine,
    private providers: Map<string, ORTHOModelProvider>,
    private vault: CredentialVault,
    private ledger: UsageLedger,
    private health: HealthMonitor
  ) {}

  // Resolve alias/canonicalID to provider+descriptor. Snapshot alias at call start — never migrates mid-flight.
  async resolve(modelRef: string, requestPolicy: RoutingPolicy = {}): Promise<{ provider: ORTHOModelProvider; descriptor: ModelDescriptor; alias?: string }> {
    const resolved = this.aliases.resolve(modelRef);
    const canonicalID = resolved.canonicalID;
    const aliasName = resolved.alias;

    // Snapshot descriptor at resolve time
    let descriptor = this.catalog.get(canonicalID);
    if (!descriptor) {
      // if alias not in catalog yet, try sync-like fallback: search providers list
      throw Object.assign(new Error(`model not found: ${canonicalID}`), { statusCode: 404 });
    }

    // Clone to freeze version for this request (prevents silent migration if alias updated concurrently)
    const snapshot: ModelDescriptor = { ...descriptor };

    const provider = this.providers.get(snapshot.provider);
    if (!provider) throw Object.assign(new Error(`provider not connected: ${snapshot.provider}`), { statusCode: 503 });

    // Health check — router avoids unhealthy providers per policy
    const health = this.health.getStatus(provider.name);
    if (health && !health.healthy) {
      if (requestPolicy.fallback === "fallback") {
        const fallback = this.policy.findFallback(snapshot, this.catalog.list(), this.providers, requestPolicy);
        if (fallback) {
          const fbProvider = this.providers.get(fallback.provider);
          if (fbProvider) return { provider: fbProvider, descriptor: { ...fallback }, alias: aliasName };
        }
      }
      throw Object.assign(new Error(`provider ${provider.name} is unhealthy`), { statusCode: 503 });
    }

    // Availability fallback
    if (this.policy.shouldFallback(snapshot, requestPolicy)) {
      const fb = this.policy.findFallback(snapshot, this.catalog.list(), this.providers, requestPolicy);
      if (fb) {
        const fbProvider = this.providers.get(fb.provider)!;
        return { provider: fbProvider, descriptor: { ...fb }, alias: aliasName };
      }
    }

    this.policy.enforce(snapshot, provider, requestPolicy);

    return { provider, descriptor: snapshot, alias: aliasName };
  }

  async routeConverse(req: { model: string; messages: any[]; system?: string; tools?: any[]; temperature?: number; max_tokens?: number; stream?: boolean; policy?: RoutingPolicy }): Promise<any> {
    const policy = req.policy || {};
    const { provider, descriptor, alias } = await this.resolve(req.model, policy);

    const internal: ConverseRequestInternal = {
      messages: req.messages,
      system: req.system,
      tools: req.tools,
      temperature: req.temperature,
      maxTokens: req.max_tokens,
      stream: req.stream,
    };

    // Credentials are vault-mediated, temporary. This also validates vault has key for cloud providers.
    const result = await this.vault.withTemporaryAccess(provider.name, async () => {
      // provider internally will also use vault if needed
      return provider.converse(internal);
    });

    // Normalized response regardless of provider
    const normalized = {
      model: descriptor.canonicalID,
      provider: descriptor.provider,
      alias: alias || null,
      content: result.content,
      usage: result.usage,
      stopReason: result.stopReason || "end_turn",
    };

    this.ledger.record({
      timestamp: new Date().toISOString(),
      alias: alias || descriptor.canonicalID,
      canonicalID: descriptor.canonicalID,
      provider: descriptor.provider,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: (result.usage.inputTokens / 1_000_000) * descriptor.inputPricing + (result.usage.outputTokens / 1_000_000) * descriptor.outputPricing,
    });

    return normalized;
  }

  async routeInvoke(req: { model: string; prompt: string; max_tokens?: number; temperature?: number; policy?: RoutingPolicy }): Promise<any> {
    const policy = req.policy || {};
    const { provider, descriptor, alias } = await this.resolve(req.model, policy);
    const internal: InvokeRequestInternal = { prompt: req.prompt, maxTokens: req.max_tokens, temperature: req.temperature };

    const result = await this.vault.withTemporaryAccess(provider.name, async () => provider.invoke(internal));

    const normalized = {
      model: descriptor.canonicalID,
      provider: descriptor.provider,
      alias: alias || null,
      content: result.content,
      usage: result.usage,
    };

    this.ledger.record({
      timestamp: new Date().toISOString(),
      alias: alias || descriptor.canonicalID,
      canonicalID: descriptor.canonicalID,
      provider: descriptor.provider,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cost: (result.usage.inputTokens / 1_000_000) * descriptor.inputPricing + (result.usage.outputTokens / 1_000_000) * descriptor.outputPricing,
    });

    return normalized;
  }

  async routeStream(req: { model: string; messages: any[]; system?: string; policy?: RoutingPolicy }): Promise<AsyncIterable<string>> {
    const { provider } = await this.resolve(req.model, req.policy || {});
    return provider.stream({ messages: req.messages, system: req.system });
  }
}
