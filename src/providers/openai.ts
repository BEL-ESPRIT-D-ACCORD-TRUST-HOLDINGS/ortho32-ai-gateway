import { ORTHOModelProvider, ConverseRequestInternal, ConverseResponseInternal, InvokeRequestInternal, InvokeResponseInternal, EmbedRequestInternal, EmbedResponseInternal } from "./base";
import { CredentialVault } from "../vault/credentials";
import { ModelDescriptor } from "../gateway/catalog";

export class OpenAIProvider implements ORTHOModelProvider {
  readonly name = "openai";
  readonly isLocal = false;
  constructor(private vault: CredentialVault) {}
  async listModels(): Promise<ModelDescriptor[]> {
    const now = new Date().toISOString();
    return [
      { canonicalID: "openai:gpt-4o-2024-08-06", provider: "openai", providerModelID: "gpt-4o-2024-08-06", displayName: "GPT-4o", family: "gpt-4o", version: "2024-08-06", modalities: ["text","vision"], contextWindow: 128000, toolUse: true, streaming: true, structuredOutput: true, embeddings: false, reasoning: false, inputPricing: 2.5, outputPricing: 10, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "openai:o1-2024-12-17", provider: "openai", providerModelID: "o1-2024-12-17", displayName: "o1", family: "o1", version: "2024-12-17", modalities: ["text"], contextWindow: 200000, toolUse: false, streaming: false, structuredOutput: false, embeddings: false, reasoning: true, inputPricing: 15, outputPricing: 60, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "openai:text-embedding-3-large", provider: "openai", providerModelID: "text-embedding-3-large", displayName: "Text Embedding 3 Large", family: "embeddings", version: "3", modalities: ["text"], contextWindow: 8191, toolUse: false, streaming: false, structuredOutput: false, embeddings: true, reasoning: false, inputPricing: 0.13, outputPricing: 0, availability: "available", lifecycle: "active", lastSeen: now },
    ];
  }
  capabilities(): string[] { return ["converse","invoke","stream","embeddings","reasoning","structuredOutput"]; }
  async converse(req: ConverseRequestInternal): Promise<ConverseResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    return { content: `[openai] ${req.messages.map(m=>m.content).join(" ").slice(0,200)}`, model: "gpt-4o-2024-08-06", provider: this.name, usage: { inputTokens: 10, outputTokens: 18 }, stopReason: "stop" };
  }
  async invoke(req: InvokeRequestInternal): Promise<InvokeResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    return { content: `[openai invoke] ${req.prompt.slice(0,200)}`, model: "gpt-4o-2024-08-06", provider: this.name, usage: { inputTokens: 7, outputTokens: 11 } };
  }
  async embed(req: EmbedRequestInternal): Promise<EmbedResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    return { embeddings: req.inputs.map(() => Array(3072).fill(0.01)), model: "text-embedding-3-large", provider: this.name };
  }
  async *stream(req: ConverseRequestInternal): AsyncIterable<string> {
    const r = await this.converse(req); for (const c of r.content.split(" ")) { yield c+" "; await new Promise(r=>setTimeout(r,5)); }
  }
  async health(): Promise<{ healthy: boolean; latencyMs: number }> { const h = await this.vault.has(this.name); return { healthy: h, latencyMs: h? 38:0 }; }
  async usage(): Promise<{ tokensIn: number; tokensOut: number }> { return { tokensIn:0,tokensOut:0 }; }
}
