import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModelRouter } from "../gateway/router";

const schema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
  system: z.string().optional(),
  tools: z.array(z.any()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  policy: z.object({ localOnly: z.boolean().optional(), fallback: z.enum(["error","fallback"]).optional() }).optional(),
});

export async function registerConverseRoutes(app: FastifyInstance, router: ModelRouter) {
  app.post("/api/v1/ai/converse", async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid request", details: parsed.error.flatten() });
    const body = parsed.data;

    try {
      if (body.stream) {
        const stream = await router.routeStream({ model: body.model, messages: body.messages, system: body.system, policy: body.policy as any });
        reply.header("content-type", "text/event-stream");
        reply.header("cache-control", "no-cache");
        for await (const chunk of stream) {
          reply.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
        reply.raw.end();
        return;
      }
      const result = await router.routeConverse(body as any);
      // NEVER return credentials
      return reply.send(result);
    } catch (e: any) {
      const msg = String(e.message || "internal error");
      // sanitize credential leakage
      if (msg.includes("sk-") || msg.includes("api_key") || msg.includes("credential")) {
        return reply.status(500).send({ error: "internal error" });
      }
      return reply.status(e.statusCode || 500).send({ error: msg });
    }
  });
}
