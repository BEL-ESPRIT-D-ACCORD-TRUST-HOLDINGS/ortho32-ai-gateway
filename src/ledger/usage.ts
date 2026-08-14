export type UsageRecord = {
  timestamp: string;
  alias: string;
  canonicalID: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

export class UsageLedger {
  private records: UsageRecord[] = [];

  record(entry: UsageRecord): void {
    this.records.push(entry);
  }

  // Never exposes raw provider invoices — only aggregated normalized costs
  summary(): { totalRequests: number; totalCost: number; totalInputTokens: number; totalOutputTokens: number; byProvider: Record<string, { requests: number; cost: number }>; byAlias: Record<string, { requests: number; cost: number }> } {
    let totalCost = 0, totalInputTokens = 0, totalOutputTokens = 0;
    const byProvider: Record<string, { requests: number; cost: number }> = {};
    const byAlias: Record<string, { requests: number; cost: number }> = {};
    for (const r of this.records) {
      totalCost += r.cost; totalInputTokens += r.inputTokens; totalOutputTokens += r.outputTokens;
      byProvider[r.provider] = byProvider[r.provider] || { requests: 0, cost: 0 };
      byProvider[r.provider].requests++; byProvider[r.provider].cost += r.cost;
      byAlias[r.alias] = byAlias[r.alias] || { requests: 0, cost: 0 };
      byAlias[r.alias].requests++; byAlias[r.alias].cost += r.cost;
    }
    return { totalRequests: this.records.length, totalCost, totalInputTokens, totalOutputTokens, byProvider, byAlias };
  }

  list(): UsageRecord[] { return [...this.records]; }

  reset(): void { this.records = []; }
}
