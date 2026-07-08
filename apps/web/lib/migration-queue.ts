import { Queue } from "bullmq";
import { buildRedisConnectionOptions } from "@storebridge/shared";

export async function enqueueMigrationJob(action: string, migrationId: string) {
  if (!process.env.REDIS_URL) {
    throw new Error("Redis queue is not configured.");
  }

  const connection = buildRedisConnectionOptions(process.env.REDIS_URL);
  const queue = new Queue("migrations", { connection });
  try {
    await queue.add(
      action,
      { migrationId, action },
      {
        jobId: `${action}:${migrationId}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  } finally {
    await queue.close();
  }
}
