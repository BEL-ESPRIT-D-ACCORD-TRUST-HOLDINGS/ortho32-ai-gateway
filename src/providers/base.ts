import type { ModelDescriptor } from "../gateway/catalog";

export type ConverseMessage = { role: "user" | "assistant" | "system"; content: string };
export type ConverseRequestInternal = {
  messages: ConverseMessage[];
  system?: string;
  tools?: any[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};
export type ConverseResponseInternal = {
  content: string;
  model: string;
  provider: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason?: string;
};
export type InvokeRequestInternal = { prompt: string; maxTokens?: number; temperature?: number };
export type InvokeResponseInternal = ConverseResponseInternal;
export type EmbedRequestInternal = { inputs: string[] };
export type EmbedResponseInternal = { embeddings: number[][]; model: string; provider: string };

export interface ORTHOModelProvider {
  readonly name: string;
  readonly isLocal: boolean;
  listModels(): Promise<ModelDescriptor[]>;
  capabilities(): string[];
  converse(req: ConverseRequestInternal): Promise<ConverseResponseInternal>;
  invoke(req: InvokeRequestInternal): Promise<InvokeResponseInternal>;
  embed(req: EmbedRequestInternal): Promise<EmbedResponseInternal>;
  stream(req: ConverseRequestInternal): AsyncIterable<string>;
  health(): Promise<{ healthy: boolean; latencyMs: number }>;
  usage(): Promise<{ tokensIn: number; tokensOut: number }>;
}
