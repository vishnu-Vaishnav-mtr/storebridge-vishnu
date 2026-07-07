import IORedis from "ioredis";
import { prisma } from "@storebridge/database";

export type HealthStatus =
  "Healthy" | "Degraded" | "Offline" | "Not configured";

export interface HealthCheckResult {
  label: string;
  status: HealthStatus;
  lastCheckedAt: Date;
  responseTimeMs?: number;
  lastError?: string;
}

interface RedisPingClient {
  connect(): Promise<unknown>;
  ping(): Promise<string>;
  disconnect(): void;
}

export async function checkPostgresHealth(
  db = prisma,
): Promise<HealthCheckResult> {
  const started = performance.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      label: "PostgreSQL",
      status: "Healthy",
      lastCheckedAt: new Date(),
      responseTimeMs: Math.round(performance.now() - started),
    };
  } catch {
    return {
      label: "PostgreSQL",
      status: "Offline",
      lastCheckedAt: new Date(),
      responseTimeMs: Math.round(performance.now() - started),
      lastError: "Database check failed.",
    };
  }
}

export async function checkRedisHealth(
  redisUrl = process.env.REDIS_URL,
  clientFactory: (url: string) => RedisPingClient = (url) =>
    new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true }),
): Promise<HealthCheckResult> {
  if (!redisUrl) {
    return {
      label: "Redis",
      status: "Not configured",
      lastCheckedAt: new Date(),
    };
  }

  const started = performance.now();
  const redis = clientFactory(redisUrl);
  try {
    await redis.connect();
    const pong = await redis.ping();
    return {
      label: "Redis",
      status: pong === "PONG" ? "Healthy" : "Degraded",
      lastCheckedAt: new Date(),
      responseTimeMs: Math.round(performance.now() - started),
    };
  } catch {
    return {
      label: "Redis",
      status: "Offline",
      lastCheckedAt: new Date(),
      responseTimeMs: Math.round(performance.now() - started),
      lastError: "Redis check failed.",
    };
  } finally {
    redis.disconnect();
  }
}

export async function checkWorkerHealth(
  db = prisma,
  staleThresholdSeconds = Number(
    process.env.WORKER_HEARTBEAT_STALE_SECONDS ?? 60,
  ),
): Promise<HealthCheckResult> {
  const heartbeat = await db.workerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  });
  const now = new Date();
  if (!heartbeat) {
    return {
      label: "Worker",
      status: "Offline",
      lastCheckedAt: now,
      lastError: "No worker heartbeat found.",
    };
  }

  const ageMs = now.getTime() - heartbeat.lastSeenAt.getTime();
  const stale = ageMs > staleThresholdSeconds * 1000;
  const result: HealthCheckResult = {
    label: "Worker",
    status: stale
      ? "Offline"
      : heartbeat.status.toLowerCase() === "healthy"
        ? "Healthy"
        : "Degraded",
    lastCheckedAt: now,
    responseTimeMs: Math.max(0, ageMs),
  };
  if (stale) result.lastError = "Worker heartbeat is stale.";
  return result;
}

export async function getInfrastructureHealth() {
  const [postgres, redis, worker] = await Promise.all([
    checkPostgresHealth(),
    checkRedisHealth(),
    checkWorkerHealth().catch((): HealthCheckResult => ({
      label: "Worker",
      status: "Offline",
      lastCheckedAt: new Date(),
      lastError: "Worker health check failed.",
    })),
  ]);

  const objectStorage: HealthCheckResult = {
    label: "Object Storage",
    status: process.env.OBJECT_STORAGE_PROVIDER ? "Healthy" : "Not configured",
    lastCheckedAt: new Date(),
  };

  return { postgres, redis, worker, objectStorage };
}
