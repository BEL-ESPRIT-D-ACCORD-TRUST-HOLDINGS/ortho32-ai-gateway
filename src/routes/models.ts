import { FastifyInstance } from "fastify";
import { ModelCatalogService } from "../gateway/catalog";

export async function registerModelRoutes(app: FastifyInstance, catalog: ModelCatalogService) {
  app.get("/api/v1/ai/models", async (_req, reply) => {
    const models = catalog.list();
    return reply.send({ models, lastSync: catalog.getLastSync() });
  });

  app.get("/api/v1/ai/models/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const decoded = decodeURIComponent(id);
    const model = catalog.get(decoded);
    if (!model) return reply.status(404).send({ error: "model not found" });
    return reply.send(model);
  });
}
