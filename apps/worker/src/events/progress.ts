import IORedis from "ioredis";
import { prisma } from "@storebridge/database";

const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

export async function publishProgress(migrationId: string, message: string) {
  await redis.publish(`migration:${migrationId}:events`, message);
  await prisma.migrationLog.create({
    data: {
      migrationId,
      level: "INFO",
      message,
    },
  });
}
