import Fastify from "fastify";
import { ModelCatalogService } from "./gateway/catalog";
import { ModelAliases } from "./gateway/aliases";
import { PolicyEngine } from "./gateway/policy";
import { ModelRouter } from "./gateway/router";
import { CredentialVault, globalVault } from "./vault/credentials";
import { UsageLedger } from "./ledger/usage";
import { HealthMonitor } from "./health/monitor";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { MetaProvider } from "./providers/meta";
import { MistralProvider } from "./providers/mistral";
import { BedrockProvider } from "./providers/bedrock";
import { LocalProvider } from "./providers/local";
import { registerConverseRoutes } from "./routes/converse";
import { registerInvokeRoutes } from "./routes/invoke";
import { registerModelRoutes } from "./routes/models";
import { registerProviderRoutes } from "./routes/providers";
import { registerUsageRoutes } from "./routes/usage";
import { registerAliasRoutes } from "./routes/aliases";

export async function buildGateway(opts?: { vault?: CredentialVault; port?: number }) {
  const vault = opts?.vault || globalVault;
  const catalog = new ModelCatalogService();
  const aliases = new ModelAliases();
  const policy = new PolicyEngine();
  const ledger = new UsageLedger();

  const providers = new Map<string, any>([
    ["anthropic", new AnthropicProvider(vault)],
    ["openai", new OpenAIProvider(vault)],
    ["meta", new MetaProvider(vault)],
    ["mistral", new MistralProvider(vault)],
    ["bedrock", new BedrockProvider(vault)],
    ["local", new LocalProvider("ollama")],
  ]);

  const health = new HealthMonitor(providers as any);
  const router = new ModelRouter(catalog, aliases, policy, providers as any, vault, ledger, health);

  // initial sync
  await catalog.syncFromProviders(Array.from(providers.values()));
  health.start();
  // periodic catalog refresh every 5m
  const syncInterval = setInterval(() => catalog.syncFromProviders(Array.from(providers.values())), 5 * 60 * 1000);
  if (syncInterval.unref) syncInterval.unref();

  const app = Fastify({ logger: false });

  // sanitize logs — never log credentials
  app.addHook("onRequest", async (req) => {
    const body: any = (req as any).body;
    if (body && (body.api_key || body.apiKey || body.credential)) {
      (req as any).body = { ...body, api_key: "[REDACTED]", apiKey: "[REDACTED]", credential: "[REDACTED]" };
    }
  });

  await registerConverseRoutes(app, router);
  await registerInvokeRoutes(app, router);
  await registerModelRoutes(app, catalog);
  await registerProviderRoutes(app, providers, health);
  await registerUsageRoutes(app, ledger);
  await registerAliasRoutes(app, aliases, catalog);

  app.get("/health", async () => ({ status: "ok", lastSync: catalog.getLastSync() }));

  return { app, catalog, aliases, policy, router, providers, vault, ledger, health };
}

if (require.main === module) {
  const port = Number(process.env.PORT || process.env.ORTHO_GATEWAY_PORT || 7033);
  buildGateway().then(({ app }) => {
    app.listen({ port, host: "0.0.0.0" }, (err) => {
      if (err) { console.error(err.message); process.exit(1); }
      console.log(`ortho32-ai-gateway listening on ${port}`);
    });
  });
}
