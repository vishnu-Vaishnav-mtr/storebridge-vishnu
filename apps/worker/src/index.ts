import { QueueEvents, Worker } from "bullmq";
import { prisma } from "@storebridge/database";
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
  logger.error({ jobId: job?.id, error }, "Migration job failed");
});

events.on("completed", ({ jobId }) => {
  logger.info({ jobId }, "Migration job completed");
});

async function shutdown() {
  clearInterval(heartbeatTimer);
  await heartbeat("stopped").catch(() => undefined);
  await Promise.all([worker.close(), events.close(), prisma.$disconnect()]);
}

process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

logger.info("StoreBridge migration worker started");
