# ortho32-ai-gateway

Model-agnostic inference layer — like a private Amazon Bedrock.

Applications **never** import `AnthropicClient` or `OpenAIClient` directly. They call the gateway. The gateway normalizes everything.

```
App -> POST /api/v1/ai/converse { model: "coding.default", messages: [...] }
     -> Gateway resolves alias -> checks policy -> checks health -> vault-mediated credential -> provider -> normalized response
```

## Quick start

```bash
npm install
npm run build
PORT=7033 npm start
# health
curl http://localhost:7033/health
# catalog
curl http://localhost:7033/api/v1/ai/models
# converse via alias
curl -X POST http://localhost:7033/api/v1/ai/converse \
  -H 'content-type: application/json' \
  -d '{"model":"coding.default","messages":[{"role":"user","content":"write hello world in python"}]}'
```

Port is configurable via `PORT` or `ORTHO_GATEWAY_PORT` (default `7033`).

## Provider setup — credentials go to vault

Credentials **never** appear in plaintext config, logs, or responses. They are encrypted at rest and only temporarily decrypted in-flight.

```ts
import { globalVault } from "./src/vault/credentials";
await globalVault.set("anthropic", process.env.ANTHROPIC_API_KEY!);
await globalVault.set("openai", process.env.OPENAI_API_KEY!);
await globalVault.set("bedrock", process.env.AWS_BEARER_TOKEN_BEDROCK!);
// local providers need no credential (ollama / llama.cpp / vLLM / ORTHO runtime)
```

Or via environment seeding on boot (the gateway reads `ORTHO_VAULT_MASTER_KEY` to derive encryption key).

Supported providers:
- `anthropic` — Claude family. Catalog sync from Anthropic API. Key from vault.
- `openai` — GPT + o-series + embeddings. Key from vault.
- `meta` — Llama 3.x. Key from vault.
- `mistral` — Mistral Large/Small/Embed. Key from vault.
- `bedrock` — 100+ models via AWS Bedrock. AWS credentials from vault.
- `local` — Ollama, llama.cpp, vLLM, custom ORTHO runtime. No network credential. Works offline.

Health is polled every 30s (`HealthMonitor`). Unhealthy providers are avoided per policy.

## Alias model

Applications use **aliases**, not raw model IDs.

| Alias | Default canonical | Policy | Notes |
|---|---|---|---|
| `coding.default` | `anthropic:claude-3-5-sonnet-20241022` | `pin` | Best coding |
| `reasoning.deep` | `openai:o1-2024-12-17` | `pin` | Deep reasoning |
| `vision.default` | `anthropic:claude-3-5-sonnet-20241022` | `pin` | Vision |
| `formal.math` | `meta:llama-3.1-405b-instruct` | `pin` | Math/proofs |
| `fast.default` | `mistral:mistral-small-2409` | `notify` | Low latency |
| `offline.default` | `local:llama-3.2-3b-instruct` | `pin` | Offline |

Aliases **pin to specific versions**. Auto-discovery syncs the catalog automatically, but **never** silently migrates behavior.

- `pin` — alias never changes unless you `PUT /api/v1/ai/routes/:name`.
- `notify` — gateway can suggest new version but won't switch without explicit update.
- `auto` — (opt-in) gateway may advance within same family after notification window.

```bash
# read aliases (called "routes" in API for ORTHO routing parity)
curl http://localhost:7033/api/v1/ai/routes

# update alias — explicit, versioned
curl -X PUT http://localhost:7033/api/v1/ai/routes/coding.default \
  -H 'content-type: application/json' \
  -d '{"canonicalID":"anthropic:claude-3-5-sonnet-20241022","provider":"anthropic","providerModelID":"claude-3-5-sonnet-20241022","version":"20241022","updatePolicy":"pin"}'
```

In-flight requests snapshot the alias at start — updating the alias mid-flight never migrates the in-flight call.

## Routing policy

`POST /api/v1/ai/converse` and `/invoke` accept `policy`:

```json
{ "model": "coding.default", "policy": { "localOnly": true, "fallback": "error" } }
```

- `localOnly: true` — **must never route to a cloud provider**, even if local is slow or overloaded. Violation returns `403`.
- `fallback: "error" | "fallback"` — if alias points to `unavailable`/`deprecated` model, either error (`503`) or fallback to same-provider / local healthy alternative. Never silent.
- Health-aware: router avoids unhealthy providers (via `HealthMonitor`). If unhealthy and `fallback: "fallback"`, it selects a healthy fallback.

## Adding a provider

1. Implement `ORTHOModelProvider` in `src/providers/<name>.ts`:

```ts
import { ORTHOModelProvider } from "./base";
export class MyProvider implements ORTHOModelProvider {
  readonly name = "myprovider";
  readonly isLocal = false;
  async listModels() { return [ { canonicalID: "myprovider:my-model-v1", provider: "myprovider", providerModelID: "my-model-v1", displayName: "My Model", family: "my", version: "1", modalities: ["text"], contextWindow: 128000, toolUse: true, streaming: true, structuredOutput: false, embeddings: false, reasoning: false, inputPricing: 1, outputPricing: 3, availability: "available", lifecycle: "active", lastSeen: new Date().toISOString() } ]; }
  capabilities() { return ["converse"]; }
  async converse(req) { /* vault-mediated */ return { content: "...", model: "my-model-v1", provider: this.name, usage: { inputTokens: 1, outputTokens: 1 } }; }
  // ... invoke, embed, stream, health, usage
}
```

2. Register in `src/index.ts` providers map and give it the vault.
3. Add its credential: `await vault.set("myprovider", key)`.
4. Catalog sync and health will pick it up automatically. No app changes needed — expose via alias.

## Local models

`LocalProvider` supports backends:

- `ollama` (default) — `http://localhost:11434`
- `llamacpp` — llama.cpp server
- `vllm` — vLLM OpenAI-compatible endpoint
- `ortho` — custom ORTHO runtime

```ts
new LocalProvider("ollama") // or "llamacpp" | "vllm" | "ortho"
```

No vault credential. Models: `local:llama-3.2-3b-instruct`, `local:mistral-7b-instruct`, `local:phi-3-mini`. Pricing is `0`. Works offline. `offline.default` is guaranteed local.

## API

- `POST /api/v1/ai/converse` — `{ model, messages, system, tools, temperature, max_tokens, stream, policy }` -> normalized `{ model, provider, alias, content, usage }`
- `POST /api/v1/ai/invoke` — `{ model, prompt, max_tokens, temperature, policy }` -> normalized
- `GET /api/v1/ai/models` -> live catalog (`ModelDescriptor[]`)
- `GET /api/v1/ai/models/:id` -> single model
- `GET /api/v1/ai/providers` -> connected providers + health
- `GET /api/v1/ai/usage` -> token/cost ledger per provider/alias (never raw invoices)
- `GET /api/v1/ai/routes` / `PUT /api/v1/ai/routes/:name` -> alias CRUD

## Security guarantees

- Vault encrypts at rest (AES-256-GCM). Credentials are never logged, never returned to clients, never in error messages.
- `ModelRouter` snapshots alias version per request — no silent behavioral upgrade.
- All providers implement the same `ORTHOModelProvider` interface. Applications cannot import providers directly.
