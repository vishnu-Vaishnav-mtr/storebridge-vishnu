import { Queue } from "bullmq";

export async function enqueueMigrationJob(action: string, migrationId: string) {
  if (!process.env.REDIS_URL) {
    throw new Error("Redis queue is not configured.");
  }

  const redisUrl = new URL(process.env.REDIS_URL);
  const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  };
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
