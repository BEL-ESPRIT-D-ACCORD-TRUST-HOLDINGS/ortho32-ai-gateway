import type { ORTHOModelProvider } from "../providers/base";

export type ModelDescriptor = {
  canonicalID: string; // e.g. "anthropic:claude-3-5-sonnet-20241022"
  provider: string;
  providerModelID: string;
  displayName: string;
  family: string;
  version: string;
  modalities: string[]; // ["text","vision"]
  contextWindow: number;
  toolUse: boolean;
  streaming: boolean;
  structuredOutput: boolean;
  embeddings: boolean;
  reasoning: boolean;
  inputPricing: number; // per 1M tokens
  outputPricing: number;
  availability: "available" | "unavailable" | "deprecated";
  lifecycle: "active" | "preview" | "deprecated" | "retired";
  lastSeen: string; // ISO timestamp
};

export class ModelCatalogService {
  private models = new Map<string, ModelDescriptor>();
  private lastSync: string | null = null;

  list(): ModelDescriptor[] {
    return Array.from(this.models.values());
  }

  get(canonicalID: string): ModelDescriptor | undefined {
    return this.models.get(canonicalID);
  }

  has(canonicalID: string): boolean {
    return this.models.has(canonicalID);
  }

  upsert(descriptor: ModelDescriptor): void {
    this.models.set(descriptor.canonicalID, descriptor);
  }

  // Syncs from providers automatically. Never silently upgrades alias pins (aliases handle that).
  async syncFromProviders(providers: ORTHOModelProvider[]): Promise<ModelDescriptor[]> {
    const all: ModelDescriptor[] = [];
    for (const p of providers) {
      try {
        const models = await p.listModels();
        for (const m of models) {
          const normalized: ModelDescriptor = {
            ...m,
            lastSeen: new Date().toISOString(),
            availability: m.availability || "available",
          };
          this.models.set(normalized.canonicalID, normalized);
          all.push(normalized);
        }
      } catch {
        // provider unavailable — mark its models unavailable but keep them
        for (const [id, desc] of this.models) {
          if (desc.provider === p.name) {
            this.models.set(id, { ...desc, availability: "unavailable" });
          }
        }
      }
    }
    this.lastSync = new Date().toISOString();
    return all;
  }

  getLastSync(): string | null {
    return this.lastSync;
  }
}
