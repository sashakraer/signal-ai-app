import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import { healthRoutes } from "./api/health.js";
import { adminRoutes } from "./api/admin.js";
import { webhookRoutes } from "./api/webhooks.js";
import { feedbackRoutes } from "./api/feedback.js";

async function main() {
  const app = Fastify({
    logger: false, // We use our own pino instance
  });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // Routes
  await app.register(healthRoutes);
  await app.register(adminRoutes);
  await app.register(webhookRoutes);
  await app.register(feedbackRoutes);

  // Start
  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info({ port: config.PORT, env: config.NODE_ENV }, "Signal AI server started");
  } catch (err) {
    logger.fatal(err, "Failed to start server");
    process.exit(1);
  }
}

main();
