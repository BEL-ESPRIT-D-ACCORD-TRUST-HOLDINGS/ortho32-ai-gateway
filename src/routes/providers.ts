import { FastifyInstance } from "fastify";
import { HealthMonitor } from "../health/monitor";

export async function registerProviderRoutes(app: FastifyInstance, providers: Map<string, any>, health: HealthMonitor) {
  app.get("/api/v1/ai/providers", async (_req, reply) => {
    const list = [];
    for (const [name, p] of providers) {
      const h = health.getStatus(name);
      list.push({ name, isLocal: p.isLocal, capabilities: p.capabilities(), health: h || { healthy: true, latencyMs: 0, lastCheck: new Date().toISOString() } });
    }
    return reply.send({ providers: list });
  });
}
