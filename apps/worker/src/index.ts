import { QueueEvents, Worker } from "bullmq";
import { logger } from "@storebridge/logger";
import { processMigrationJob } from "./processors/migration-processor";

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
};

const worker = new Worker(
  "migrations",
  async (job) => {
    await processMigrationJob(
      job.name,
      job.data as { migrationId: string; action: string },
    );
  },
  {
    connection,
    concurrency: Number(process.env.MIGRATION_WORKER_CONCURRENCY ?? 2),
  },
);

const events = new QueueEvents("migrations", { connection });

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error }, "Migration job failed");
});

events.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Migration job completed");
});

logger.info("StoreBridge migration worker started");
