import { ORTHOModelProvider, ConverseRequestInternal, ConverseResponseInternal, InvokeRequestInternal, InvokeResponseInternal, EmbedRequestInternal, EmbedResponseInternal } from "./base";
import { CredentialVault } from "../vault/credentials";
import { ModelDescriptor } from "../gateway/catalog";

export class MistralProvider implements ORTHOModelProvider {
  readonly name = "mistral";
  readonly isLocal = false;
  constructor(private vault: CredentialVault) {}
  async listModels(): Promise<ModelDescriptor[]> {
    const now = new Date().toISOString();
    return [
      { canonicalID: "mistral:mistral-large-2407", provider: "mistral", providerModelID: "mistral-large-2407", displayName: "Mistral Large 2407", family: "mistral", version: "2407", modalities: ["text"], contextWindow: 128000, toolUse: true, streaming: true, structuredOutput: true, embeddings: false, reasoning: false, inputPricing: 2, outputPricing: 6, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "mistral:mistral-small-2409", provider: "mistral", providerModelID: "mistral-small-2409", displayName: "Mistral Small 2409", family: "mistral", version: "2409", modalities: ["text"], contextWindow: 32000, toolUse: true, streaming: true, structuredOutput: true, embeddings: false, reasoning: false, inputPricing: 0.2, outputPricing: 0.6, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "mistral:mistral-embed", provider: "mistral", providerModelID: "mistral-embed", displayName: "Mistral Embed", family: "embed", version: "1", modalities: ["text"], contextWindow: 8192, toolUse: false, streaming: false, structuredOutput: false, embeddings: true, reasoning: false, inputPricing: 0.1, outputPricing: 0, availability: "available", lifecycle: "active", lastSeen: now },
    ];
  }
  capabilities(): string[] { return ["converse","invoke","embeddings"]; }
  async converse(req: ConverseRequestInternal): Promise<ConverseResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k)=>{ if(!k) throw new Error("missing credential"); });
    return { content: `[mistral] ${req.messages.map(m=>m.content).join(" ").slice(0,200)}`, model: "mistral-large-2407", provider: this.name, usage: { inputTokens: 11, outputTokens: 16 } };
  }
  async invoke(req: InvokeRequestInternal): Promise<InvokeResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k)=>{ if(!k) throw new Error("missing credential"); });
    return { content: `[mistral invoke] ${req.prompt.slice(0,200)}`, model: "mistral-small-2409", provider: this.name, usage: { inputTokens: 5, outputTokens: 9 } };
  }
  async embed(req: EmbedRequestInternal): Promise<EmbedResponseInternal> {
    await this.vault.withTemporaryAccess(this.name, async (k)=>{ if(!k) throw new Error("missing credential"); });
    return { embeddings: req.inputs.map(()=>Array(1024).fill(0.02)), model: "mistral-embed", provider: this.name };
  }
  async *stream(req: ConverseRequestInternal): AsyncIterable<string> { const r=await this.converse(req); for(const c of r.content.split(" ")) { yield c+" "; await new Promise(r=>setTimeout(r,5)); } }
  async health(): Promise<{ healthy: boolean; latencyMs: number }> { const h=await this.vault.has(this.name); return { healthy: h, latencyMs: h? 44:0 }; }
  async usage(): Promise<{ tokensIn: number; tokensOut: number }> { return { tokensIn:0,tokensOut:0 }; }
}
