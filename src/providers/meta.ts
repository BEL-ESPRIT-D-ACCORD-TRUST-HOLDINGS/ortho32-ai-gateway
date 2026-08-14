import { ORTHOModelProvider, ConverseRequestInternal, ConverseResponseInternal, InvokeRequestInternal, InvokeResponseInternal, EmbedRequestInternal, EmbedResponseInternal } from "./base";
import { CredentialVault } from "../vault/credentials";
import { ModelDescriptor } from "../gateway/catalog";

export class MetaProvider implements ORTHOModelProvider {
  readonly name = "meta";
  readonly isLocal = false;
  constructor(private vault: CredentialVault) {}
  async listModels(): Promise<ModelDescriptor[]> {
    const now = new Date().toISOString();
    return [
      { canonicalID: "meta:llama-3.1-405b-instruct", provider: "meta", providerModelID: "llama-3.1-405b-instruct", displayName: "Llama 3.1 405B Instruct", family: "llama", version: "3.1", modalities: ["text"], contextWindow: 128000, toolUse: true, streaming: true, structuredOutput: true, embeddings: false, reasoning: false, inputPricing: 3, outputPricing: 3, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "meta:llama-3.1-8b-instruct", provider: "meta", providerModelID: "llama-3.1-8b-instruct", displayName: "Llama 3.1 8B Instruct", family: "llama", version: "3.1", modalities: ["text"], contextWindow: 128000, toolUse: true, streaming: true, structuredOutput: true, embeddings: false, reasoning: false, inputPricing: 0.2, outputPricing: 0.2, availability: "available", lifecycle: "active", lastSeen: now },
    ];
  }
  capabilities(): string[] { return ["converse","invoke","stream"]; }
  async converse(req: ConverseRequestInternal): Promise<ConverseResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    return { content: `[meta] ${req.messages.map(m=>m.content).join(" ").slice(0,200)}`, model: "llama-3.1-405b-instruct", provider: this.name, usage: { inputTokens: 9, outputTokens: 15 } };
  }
  async invoke(req: InvokeRequestInternal): Promise<InvokeResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k) => { if (!k) throw new Error("missing credential"); });
    return { content: `[meta invoke] ${req.prompt.slice(0,200)}`, model: "llama-3.1-405b-instruct", provider: this.name, usage: { inputTokens: 6, outputTokens: 10 } };
  }
  async embed(_req: EmbedRequestInternal): Promise<EmbedResponseInternal> { throw new Error("not supported"); }
  async *stream(req: ConverseRequestInternal): AsyncIterable<string> { const r=await this.converse(req); for(const c of r.content.split(" ")) { yield c+" "; await new Promise(r=>setTimeout(r,5)); } }
  async health(): Promise<{ healthy: boolean; latencyMs: number }> { const h=await this.vault.has(this.name); return { healthy: h, latencyMs: h? 50:0 }; }
  async usage(): Promise<{ tokensIn: number; tokensOut: number }> { return { tokensIn:0,tokensOut:0 }; }
}
