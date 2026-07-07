import { describe, expect, it, vi } from "vitest";
import {
  checkPostgresHealth,
  checkRedisHealth,
  checkWorkerHealth,
} from "../lib/health";

describe("health checks", () => {
  it("reports PostgreSQL healthy when a lightweight query succeeds", async () => {
    const db = { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) };
    const result = await checkPostgresHealth(db as never);
    expect(result.status).toBe("Healthy");
  });

  it("reports PostgreSQL offline when a lightweight query fails", async () => {
    const db = {
      $queryRaw: vi.fn(async () => Promise.reject(new Error("down"))),
    };
    const result = await checkPostgresHealth(db as never);
    expect(result.status).toBe("Offline");
  });

  it("reports Redis not configured when no URL exists", async () => {
    const result = await checkRedisHealth("");
    expect(result.status).toBe("Not configured");
  });

  it("reports Redis healthy when ping returns PONG", async () => {
    const result = await checkRedisHealth("redis://example.com", () => ({
      connect: vi.fn(async () => undefined),
      ping: vi.fn(async () => "PONG"),
      disconnect: vi.fn(),
    }));
    expect(result.status).toBe("Healthy");
  });

  it("reports missing worker heartbeat as offline", async () => {
    const db = { workerHeartbeat: { findFirst: vi.fn(async () => null) } };
    const result = await checkWorkerHealth(db as never);
    expect(result.status).toBe("Offline");
    expect(result.lastError).toBe("No worker heartbeat found.");
  });

  it("reports stale worker heartbeat as offline", async () => {
    const db = {
      workerHeartbeat: {
        findFirst: vi.fn(async () => ({
          status: "healthy",
          lastSeenAt: new Date(Date.now() - 120_000),
        })),
      },
    };
    const result = await checkWorkerHealth(db as never, 60);
    expect(result.status).toBe("Offline");
    expect(result.lastError).toBe("Worker heartbeat is stale.");
  });

  it("reports recent worker heartbeat as healthy", async () => {
    const db = {
      workerHeartbeat: {
        findFirst: vi.fn(async () => ({
          status: "healthy",
          lastSeenAt: new Date(),
        })),
      },
    };
    const result = await checkWorkerHealth(db as never, 60);
    expect(result.status).toBe("Healthy");
  });
});
