import { config } from "./config/index.js";
import { logger } from "./lib/logger.js";
import {
  createWorker,
  syncSalesforceQueue,
  syncEmailQueue,
} from "./lib/queue.js";

// ─── Job Processors ───────────────────────────────────────────────────────────

const syncSalesforceWorker = createWorker("sync-salesforce", async (job) => {
  const { tenantId } = job.data;
  logger.info({ tenantId }, "Syncing Salesforce data");
  // TODO: Implement SF adapter sync
});

const syncEmailWorker = createWorker("sync-email", async (job) => {
  const { tenantId, userId } = job.data;
  logger.info({ tenantId, userId }, "Syncing email via Graph API");
  // TODO: Implement Microsoft Graph mail sync
});

const processEventWorker = createWorker("process-event", async (job) => {
  const { tenantId, eventId } = job.data;
  logger.info({ tenantId, eventId }, "Processing event");
  // TODO: Implement event processing pipeline
});

const sendSignalWorker = createWorker("send-signal", async (job) => {
  const { signalId } = job.data;
  logger.info({ signalId }, "Sending signal");
  // TODO: Implement signal delivery
});

// ─── Recurring Jobs (Cron) ────────────────────────────────────────────────────

async function setupRecurringJobs() {
  // Salesforce sync — every 15 minutes
  await syncSalesforceQueue.upsertJobScheduler(
    "sf-sync-recurring",
    { pattern: "*/15 * * * *" },
    { name: "sf-sync", data: { type: "all-tenants" } }
  );

  // Email sync — every 15 minutes
  await syncEmailQueue.upsertJobScheduler(
    "email-sync-recurring",
    { pattern: "*/15 * * * *" },
    { name: "email-sync", data: { type: "all-tenants" } }
  );

  logger.info("Recurring jobs configured");
}

// ─── Start ────────────────────────────────────────────────────────────────────

logger.info("Signal AI worker started");
setupRecurringJobs().catch((err) => {
  logger.error(err, "Failed to set up recurring jobs");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Shutting down workers...");
  await syncSalesforceWorker.close();
  await syncEmailWorker.close();
  await processEventWorker.close();
  await sendSignalWorker.close();
  process.exit(0);
});
