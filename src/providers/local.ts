import { ORTHOModelProvider, ConverseRequestInternal, ConverseResponseInternal, InvokeRequestInternal, InvokeResponseInternal, EmbedRequestInternal, EmbedResponseInternal } from "./base";
import { ModelDescriptor } from "../gateway/catalog";

export type LocalBackend = "ollama" | "llamacpp" | "vllm" | "ortho";

export class LocalProvider implements ORTHOModelProvider {
  readonly name = "local";
  readonly isLocal = true;
  private backend: LocalBackend;
  constructor(backend: LocalBackend = "ollama") { this.backend = backend; }

  async listModels(): Promise<ModelDescriptor[]> {
    const now = new Date().toISOString();
    return [
      { canonicalID: "local:llama-3.2-3b-instruct", provider: "local", providerModelID: "llama-3.2-3b-instruct", displayName: "Llama 3.2 3B Instruct (local)", family: "llama", version: "3.2", modalities: ["text"], contextWindow: 128000, toolUse: true, streaming: true, structuredOutput: true, embeddings: true, reasoning: false, inputPricing: 0, outputPricing: 0, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "local:mistral-7b-instruct", provider: "local", providerModelID: "mistral-7b-instruct", displayName: "Mistral 7B (local)", family: "mistral", version: "7b", modalities: ["text"], contextWindow: 32000, toolUse: false, streaming: true, structuredOutput: false, embeddings: false, reasoning: false, inputPricing: 0, outputPricing: 0, availability: "available", lifecycle: "active", lastSeen: now },
      { canonicalID: "local:phi-3-mini", provider: "local", providerModelID: "phi-3-mini", displayName: "Phi-3 Mini (local)", family: "phi", version: "3", modalities: ["text"], contextWindow: 128000, toolUse: false, streaming: true, structuredOutput: true, embeddings: false, reasoning: false, inputPricing: 0, outputPricing: 0, availability: "available", lifecycle: "active", lastSeen: now },
    ];
  }

  capabilities(): string[] { return ["converse","invoke","stream","embeddings"]; }

  async converse(req: ConverseRequestInternal): Promise<ConverseResponseInternal> {
    // No vault credential needed for local — supports offline
    const text = req.messages.map(m=>m.content).join(" ");
    // simulate tiny latency
    await new Promise(r=>setTimeout(r, 10));
    return { content: `[local:${this.backend}] ${text.slice(0,200)}`, model: "llama-3.2-3b-instruct", provider: this.name, usage: { inputTokens: 8, outputTokens: 12 } };
  }

  async invoke(req: InvokeRequestInternal): Promise<InvokeResponseInternal> {
    await new Promise(r=>setTimeout(r, 10));
    return { content: `[local:${this.backend} invoke] ${req.prompt.slice(0,200)}`, model: "llama-3.2-3b-instruct", provider: this.name, usage: { inputTokens: 5, outputTokens: 9 } };
  }

  async embed(req: EmbedRequestInternal): Promise<EmbedResponseInternal> {
    return { embeddings: req.inputs.map(()=>Array(768).fill(0.05)), model: "llama-3.2-3b-instruct", provider: this.name };
  }

  async *stream(req: ConverseRequestInternal): AsyncIterable<string> {
    const r = await this.converse(req);
    for (const c of r.content.split(" ")) { yield c+" "; await new Promise(r=>setTimeout(r, 5)); }
  }

  async health(): Promise<{ healthy: boolean; latencyMs: number }> {
    // local is healthy if backend reachable — simulated always healthy
    return { healthy: true, latencyMs: 5 };
  }

  async usage(): Promise<{ tokensIn: number; tokensOut: number }> { return { tokensIn: 0, tokensOut: 0 }; }
}
