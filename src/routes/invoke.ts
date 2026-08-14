import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModelRouter } from "../gateway/router";

const schema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  policy: z.object({ localOnly: z.boolean().optional(), fallback: z.enum(["error","fallback"]).optional() }).optional(),
});

export async function registerInvokeRoutes(app: FastifyInstance, router: ModelRouter) {
  app.post("/api/v1/ai/invoke", async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid request", details: parsed.error.flatten() });
    try {
      const result = await router.routeInvoke(parsed.data as any);
      return reply.send(result);
    } catch (e: any) {
      const msg = String(e.message || "internal error");
      if (msg.includes("sk-") || msg.includes("credential")) return reply.status(500).send({ error: "internal error" });
      return reply.status(e.statusCode || 500).send({ error: msg });
    }
  });
}
