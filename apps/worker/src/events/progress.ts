import IORedis from "ioredis";
import { prisma } from "@storebridge/database";

let redis: IORedis | null = null;

function redisClient() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required.");
  redis ??= new IORedis(process.env.REDIS_URL);
  return redis;
}

export async function publishProgress(migrationId: string, message: string) {
  await redisClient().publish(`migration:${migrationId}:events`, message);
  await prisma.migrationLog.create({
    data: {
      migrationId,
      level: "INFO",
      message,
    },
  });
}
