import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { signals } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { syncEmailQueue } from "../lib/queue.js";

export async function webhookRoutes(app: FastifyInstance) {
  // Microsoft Graph subscription validation + notifications
  app.post("/api/webhooks/graph", async (request, reply) => {
    const query = request.query as Record<string, string>;

    // Subscription validation — Graph sends validationToken as query param
    if (query.validationToken) {
      logger.info("Graph webhook validation request received");
      return reply.type("text/plain").send(query.validationToken);
    }

    // Notification payload — queue immediate mail sync for affected users
    const body = request.body as any;
    if (body?.value) {
      for (const notification of body.value) {
        logger.info(
          { resource: notification.resource, changeType: notification.changeType },
          "Graph webhook notification"
        );

        // Extract user ID from resource path (e.g., "users/{id}/messages/{id}")
        const userMatch = (notification.resource as string)?.match(/users\/([^/]+)/);
        if (userMatch) {
          await syncEmailQueue.add("graph-webhook-sync", {
            tenantId: notification.tenantId ?? "unknown",
            userId: userMatch[1],
            trigger: "webhook",
          });
        }
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

              // Update signal delivery status based on WhatsApp callback
              const waMessageId = status.id as string;
              const waStatus = status.status as string;

              if (waStatus === "delivered") {
                await db.execute(
                  sql`UPDATE signals SET delivered_at = now() WHERE context_snapshot->>'waMessageId' = ${waMessageId}`
                );
              } else if (waStatus === "read") {
                await db.execute(
                  sql`UPDATE signals SET opened_at = now() WHERE context_snapshot->>'waMessageId' = ${waMessageId}`
                );
              }
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
