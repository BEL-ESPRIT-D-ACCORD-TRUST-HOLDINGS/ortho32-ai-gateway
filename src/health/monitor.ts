import type { ORTHOModelProvider } from "../providers/base";

export type ProviderHealth = { healthy: boolean; latencyMs: number; lastCheck: string; error?: string };

export class HealthMonitor {
  private status = new Map<string, ProviderHealth>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private providers: Map<string, ORTHOModelProvider>, private intervalMs = 30_000) {}

  getStatus(provider: string): ProviderHealth | undefined { return this.status.get(provider); }

  all(): Record<string, ProviderHealth> {
    const out: Record<string, ProviderHealth> = {};
    for (const [k, v] of this.status) out[k] = v;
    return out;
  }

  async checkAll(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        const res = await provider.health();
        this.status.set(name, { healthy: res.healthy, latencyMs: res.latencyMs, lastCheck: new Date().toISOString() });
      } catch (e: any) {
        this.status.set(name, { healthy: false, latencyMs: 0, lastCheck: new Date().toISOString(), error: e.message });
      }
    }
  }

  start(): void {
    if (this.timer) return;
    this.checkAll();
    this.timer = setInterval(() => this.checkAll(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
