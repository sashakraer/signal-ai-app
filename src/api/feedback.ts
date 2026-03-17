import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { signals } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function feedbackRoutes(app: FastifyInstance) {
  // Record signal feedback
  app.post("/api/signals/:id/feedback", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { feedback } = request.body as { feedback: string };

    if (!["useful", "not_relevant"].includes(feedback)) {
      return reply.status(400).send({ error: "feedback must be 'useful' or 'not_relevant'" });
    }

    await db
      .update(signals)
      .set({ feedback, feedbackAt: new Date() })
      .where(eq(signals.id, id));

    return { ok: true };
  });

  // Mark signal as acted on (stops escalation timer)
  app.post("/api/signals/:id/acted", async (request, reply) => {
    const { id } = request.params as { id: string };

    await db
      .update(signals)
      .set({ actedOn: true })
      .where(eq(signals.id, id));

    return { ok: true };
  });
}
