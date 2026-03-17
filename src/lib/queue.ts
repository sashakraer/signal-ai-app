import { Queue, Worker } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

// Connection config — BullMQ creates its own Redis connections internally
const connectionConfig = {
  url: config.REDIS_URL,
  maxRetriesPerRequest: null as null, // Required by BullMQ
};

// Helper to extract host/port from URL for BullMQ connection
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

const redisConnection = parseRedisUrl(config.REDIS_URL);

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const syncSalesforceQueue = new Queue("sync-salesforce", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const syncEmailQueue = new Queue("sync-email", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const processEventQueue = new Queue("process-event", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 1000,
    attempts: 2,
  },
});

export const sendSignalQueue = new Queue("send-signal", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 1000,
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
  },
});

// ─── Helper to create workers ─────────────────────────────────────────────────

export function createWorker(
  queueName: string,
  processor: (job: any) => Promise<void>,
  concurrency = 5
) {
  const worker = new Worker(queueName, processor, {
    connection: redisConnection,
    concurrency,
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, queue: queueName }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, queue: queueName, error: err.message }, "Job failed");
  });

  return worker;
}
