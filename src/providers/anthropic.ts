import { ORTHOModelProvider, ConverseRequestInternal, ConverseResponseInternal, InvokeRequestInternal, InvokeResponseInternal, EmbedRequestInternal, EmbedResponseInternal } from "./base";
import { CredentialVault } from "../vault/credentials";
import { ModelDescriptor } from "../gateway/catalog";

export class AnthropicProvider implements ORTHOModelProvider {
  readonly name = "anthropic";
  readonly isLocal = false;
  constructor(private vault: CredentialVault) {}

  async listModels(): Promise<ModelDescriptor[]> {
    const now = new Date().toISOString();
    return [
      {
        canonicalID: "anthropic:claude-3-5-sonnet-20241022",
        provider: "anthropic",
        providerModelID: "claude-3-5-sonnet-20241022",
        displayName: "Claude 3.5 Sonnet",
        family: "claude",
        version: "20241022",
        modalities: ["text", "vision"],
        contextWindow: 200000,
        toolUse: true,
        streaming: true,
        structuredOutput: true,
        embeddings: false,
        reasoning: false,
        inputPricing: 3,
        outputPricing: 15,
        availability: "available",
        lifecycle: "active",
        lastSeen: now,
      },
      {
        canonicalID: "anthropic:claude-3-opus-20240229",
        provider: "anthropic",
        providerModelID: "claude-3-opus-20240229",
        displayName: "Claude 3 Opus",
        family: "claude",
        version: "20240229",
        modalities: ["text", "vision"],
        contextWindow: 200000,
        toolUse: true,
        streaming: true,
        structuredOutput: true,
        embeddings: false,
        reasoning: false,
        inputPricing: 15,
        outputPricing: 75,
        availability: "available",
        lifecycle: "active",
        lastSeen: now,
      },
    ];
  }

  capabilities(): string[] { return ["converse", "invoke", "stream", "vision", "tools"]; }

  async converse(req: ConverseRequestInternal): Promise<ConverseResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    const text = req.messages.map(m => m.content).join(" ");
    return {
      content: `[anthropic] ${text.slice(0, 200)}`,
      model: "claude-3-5-sonnet-20241022",
      provider: this.name,
      usage: { inputTokens: 12, outputTokens: 20 },
      stopReason: "end_turn",
    };
  }

  async invoke(req: InvokeRequestInternal): Promise<InvokeResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    return {
      content: `[anthropic invoke] ${req.prompt.slice(0, 200)}`,
      model: "claude-3-5-sonnet-20241022",
      provider: this.name,
      usage: { inputTokens: 8, outputTokens: 12 },
    };
  }

  async embed(_req: EmbedRequestInternal): Promise<EmbedResponseInternal> {
    throw new Error("embeddings not supported for anthropic");
  }

  async *stream(req: ConverseRequestInternal): AsyncIterable<string> {
    const res = await this.converse(req);
    for (const chunk of res.content.split(" ")) { yield chunk + " "; await new Promise(r => setTimeout(r, 5)); }
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    const has = await this.vault.has(this.name);
    return { healthy: has, latencyMs: has ? 42 : 0 };
  }

  async usage(): Promise<{ tokensIn: number; tokensOut: number }> { return { tokensIn: 0, tokensOut: 0 }; }
}
