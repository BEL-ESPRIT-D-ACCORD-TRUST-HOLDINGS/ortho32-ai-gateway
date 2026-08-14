import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModelAliases } from "../gateway/aliases";
import { ModelCatalogService } from "../gateway/catalog";

const updateSchema = z.object({
  canonicalID: z.string().min(1),
  provider: z.string().min(1),
  providerModelID: z.string().min(1),
  version: z.string().min(1),
  updatePolicy: z.enum(["auto","notify","pin"]),
  description: z.string().optional(),
});

export async function registerAliasRoutes(app: FastifyInstance, aliases: ModelAliases, catalog: ModelCatalogService) {
  app.get("/api/v1/ai/routes", async (_req, reply) => {
    return reply.send({ aliases: aliases.list() });
  });

  app.get("/api/v1/ai/routes/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const entry = aliases.get(name);
    if (!entry) return reply.status(404).send({ error: "alias not found" });
    return reply.send({ alias: name, ...entry });
  });

  app.put("/api/v1/ai/routes/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid alias", details: parsed.error.flatten() });
    const body = parsed.data;
    // Validate canonical exists in catalog (or allow if preview)
    const exists = catalog.get(body.canonicalID);
    if (!exists) return reply.status(404).send({ error: "canonical model not found in catalog; sync first" });
    aliases.set(name, body);
    return reply.send({ alias: name, ...body });
  });
}
