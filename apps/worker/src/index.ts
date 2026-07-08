import { QueueEvents, Worker } from "bullmq";
import { prisma } from "@storebridge/database";
import { logger } from "@storebridge/logger";
import { buildRedisConnectionOptions, safeRedisError } from "@storebridge/shared";
import { processMigrationJob } from "./processors/migration-processor";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required to start the migration worker.");
}

const connection = buildRedisConnectionOptions(process.env.REDIS_URL);

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
const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;

async function heartbeat(status = "healthy") {
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    update: {
      queueName: "migrations",
      status,
      lastSeenAt: new Date(),
      metrics: {
        concurrency: Number(process.env.MIGRATION_WORKER_CONCURRENCY ?? 2),
      },
    },
    create: {
      workerId,
      queueName: "migrations",
      status,
      metrics: {
        concurrency: Number(process.env.MIGRATION_WORKER_CONCURRENCY ?? 2),
      },
    },
  });
}

void heartbeat().catch((error) => {
  logger.warn({ error }, "Worker heartbeat failed");
});

const heartbeatTimer = setInterval(() => {
  void heartbeat().catch((error) => {
    logger.warn({ error }, "Worker heartbeat failed");
  });
}, 15_000);

worker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, error: safeRedisError(error) },
    "Migration job failed",
  );
});

worker.on("error", (error) => {
  logger.error({ error: safeRedisError(error) }, "Migration worker Redis error");
});

events.on("error", (error) => {
  logger.error({ error: safeRedisError(error) }, "Migration queue events Redis error");
});

events.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Migration job completed");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "StoreBridge migration worker shutting down");
  clearInterval(heartbeatTimer);
  await heartbeat("stopped").catch(() => undefined);
  await Promise.allSettled([
    worker.close(),
    events.close(),
    prisma.$disconnect(),
  ]);
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

logger.info("StoreBridge migration worker started");
