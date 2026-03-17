import { FastifyInstance } from "fastify";
import { logger } from "../lib/logger.js";

export async function webhookRoutes(app: FastifyInstance) {
  // Microsoft Graph subscription validation + notifications
  app.post("/api/webhooks/graph", async (request, reply) => {
    const query = request.query as Record<string, string>;

    // Subscription validation — Graph sends validationToken as query param
    if (query.validationToken) {
      logger.info("Graph webhook validation request received");
      return reply.type("text/plain").send(query.validationToken);
    }

    // Notification payload
    const body = request.body as any;
    if (body?.value) {
      for (const notification of body.value) {
        logger.info(
          { resource: notification.resource, changeType: notification.changeType },
          "Graph webhook notification"
        );
        // TODO: Queue event processing via BullMQ
      }
    }

    return reply.status(202).send();
  });

  // WhatsApp Cloud API webhook
  app.post("/api/webhooks/whatsapp", async (request, reply) => {
    const body = request.body as any;

    if (body?.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          if (change.value?.statuses) {
            for (const status of change.value.statuses) {
              logger.info(
                { messageId: status.id, status: status.status },
                "WhatsApp delivery status"
              );
              // TODO: Update signal delivery status
            }
          }
        }
      }
    }

    return reply.status(200).send();
  });

  // WhatsApp webhook verification (GET)
  app.get("/api/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string>;
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"]) {
      return reply.type("text/plain").send(query["hub.challenge"]);
    }
    return reply.status(403).send();
  });
}
