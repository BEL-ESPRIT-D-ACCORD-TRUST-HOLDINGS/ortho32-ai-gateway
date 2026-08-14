import { FastifyInstance } from "fastify";
import { UsageLedger } from "../ledger/usage";

export async function registerUsageRoutes(app: FastifyInstance, ledger: UsageLedger) {
  app.get("/api/v1/ai/usage", async (_req, reply) => {
    // Never exposes raw provider invoices — only normalized ledger
    return reply.send(ledger.summary());
  });
}
