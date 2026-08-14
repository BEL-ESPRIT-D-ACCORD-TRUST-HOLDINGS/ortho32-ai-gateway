export type UpdatePolicy = "auto" | "notify" | "pin";

export type AliasEntry = {
  canonicalID: string;
  provider: string;
  providerModelID: string;
  version: string;
  updatePolicy: UpdatePolicy;
  description?: string;
};

const DEFAULT_ALIASES: Record<string, AliasEntry> = {
  "coding.default": {
    canonicalID: "anthropic:claude-3-5-sonnet-20241022",
    provider: "anthropic",
    providerModelID: "claude-3-5-sonnet-20241022",
    version: "20241022",
    updatePolicy: "pin",
    description: "Best coding model — pinned, no silent upgrade",
  },
  "reasoning.deep": {
    canonicalID: "openai:o1-2024-12-17",
    provider: "openai",
    providerModelID: "o1-2024-12-17",
    version: "2024-12-17",
    updatePolicy: "pin",
  },
  "vision.default": {
    canonicalID: "anthropic:claude-3-5-sonnet-20241022",
    provider: "anthropic",
    providerModelID: "claude-3-5-sonnet-20241022",
    version: "20241022",
    updatePolicy: "pin",
  },
  "formal.math": {
    canonicalID: "meta:llama-3.1-405b-instruct",
    provider: "meta",
    providerModelID: "llama-3.1-405b-instruct",
    version: "3.1",
    updatePolicy: "pin",
  },
  "fast.default": {
    canonicalID: "mistral:mistral-small-2409",
    provider: "mistral",
    providerModelID: "mistral-small-2409",
    version: "2409",
    updatePolicy: "notify",
  },
  "offline.default": {
    canonicalID: "local:llama-3.2-3b-instruct",
    provider: "local",
    providerModelID: "llama-3.2-3b-instruct",
    version: "3.2",
    updatePolicy: "pin",
  },
};

export class ModelAliases {
  private aliases = new Map<string, AliasEntry>();

  constructor(initial?: Record<string, AliasEntry>) {
    const src = initial || DEFAULT_ALIASES;
    for (const [k, v] of Object.entries(src)) this.aliases.set(k, { ...v });
  }

  get(name: string): AliasEntry | undefined {
    const e = this.aliases.get(name);
    return e ? { ...e } : undefined;
  }

  // Update alias explicitly — never auto-migrate in-flight requests
  set(name: string, entry: AliasEntry): void {
    this.aliases.set(name, { ...entry });
  }

  list(): Record<string, AliasEntry> {
    const out: Record<string, AliasEntry> = {};
    for (const [k, v] of this.aliases) out[k] = { ...v };
    return out;
  }

  has(name: string): boolean {
    return this.aliases.has(name);
  }

  // Resolve alias or pass through canonicalID
  resolve(modelRef: string): { alias?: string; entry?: AliasEntry; canonicalID: string } {
    const entry = this.aliases.get(modelRef);
    if (entry) return { alias: modelRef, entry: { ...entry }, canonicalID: entry.canonicalID };
    // assume canonicalID directly
    return { canonicalID: modelRef };
  }
}
