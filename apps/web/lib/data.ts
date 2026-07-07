import { prisma } from "@storebridge/database";
import { calculateProgress, readinessScore } from "@storebridge/migration-core";

export async function getWorkspaceData() {
  try {
    const organisation =
      (await prisma.organisation.findFirst({
        include: {
          connections: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
          migrations: {
            include: {
              auditResults: true,
              errors: { take: 5, orderBy: { createdAt: "desc" } },
              logs: { take: 8, orderBy: { createdAt: "desc" } },
              reports: { take: 6, orderBy: { createdAt: "desc" } },
              sourceConnection: true,
              targetConnection: true,
            },
            orderBy: { updatedAt: "desc" },
          },
          activityLogs: { take: 12, orderBy: { createdAt: "desc" } },
        },
      })) ?? demoOrganisation();

    const activeMigrations = organisation.migrations.filter((migration) =>
      [
        "QUEUED",
        "RUNNING",
        "PAUSING",
        "PAUSED",
        "RESUMING",
        "DRY_RUNNING",
        "VERIFYING",
      ].includes(migration.status),
    );
    const completedMigrations = organisation.migrations.filter((migration) =>
      [
        "VERIFIED",
        "VERIFIED_WITH_WARNINGS",
        "COMPLETED",
        "COMPLETED_WITH_ERRORS",
      ].includes(migration.status),
    );
    const recordsMigrated = organisation.migrations.reduce(
      (sum, migration) => sum + migration.processedRecords,
      0,
    );
    const recordsFailed = organisation.migrations.reduce(
      (sum, migration) => sum + migration.failedRecords,
      0,
    );
    const duplicatesPrevented = organisation.migrations.reduce(
      (sum, migration) => sum + migration.duplicatesPrevented,
      0,
    );
    const successRate =
      recordsMigrated + recordsFailed === 0
        ? 0
        : Math.round(
            (recordsMigrated / (recordsMigrated + recordsFailed)) * 100,
          );

    return {
      organisation,
      metrics: {
        connectedStores: organisation.connections.filter(
          (connection) => connection.status === "CONNECTED",
        ).length,
        activeMigrations: activeMigrations.length,
        completedMigrations: completedMigrations.length,
        recordsMigrated,
        recordsFailed,
        duplicatesPrevented,
        successRate,
      },
      progress: organisation.migrations[0]
        ? calculateProgress({
            totalRecords: organisation.migrations[0].totalRecords,
            processedRecords: organisation.migrations[0].processedRecords,
            failedRecords: organisation.migrations[0].failedRecords,
            duplicatesPrevented: organisation.migrations[0].duplicatesPrevented,
          })
        : { percent: 0, successRate: 0 },
      readiness: organisation.migrations[0]
        ? readinessScore(
            organisation.migrations[0].auditResults.map((result) => ({
              ...result,
              entityType: result.entityType,
              warnings: Array.isArray(result.warnings)
                ? result.warnings.map(String)
                : [],
            })),
          )
        : 0,
      workerHealth: await getWorkerHealth(),
    };
  } catch {
    const organisation = demoOrganisation();
    return {
      organisation,
      metrics: {
        connectedStores: 0,
        activeMigrations: 0,
        completedMigrations: 0,
        recordsMigrated: 0,
        recordsFailed: 0,
        duplicatesPrevented: 0,
        successRate: 0,
      },
      progress: { percent: 0, successRate: 0 },
      readiness: 0,
      workerHealth: { status: "Unknown", lastSeenAt: null, metrics: {} },
    };
  }
}

async function getWorkerHealth() {
  try {
    const heartbeat = await prisma.workerHeartbeat.findFirst({
      orderBy: { lastSeenAt: "desc" },
    });
    return heartbeat
      ? {
          status: heartbeat.status,
          lastSeenAt: heartbeat.lastSeenAt,
          metrics: heartbeat.metrics,
        }
      : { status: "Unknown", lastSeenAt: null, metrics: {} };
  } catch {
    return { status: "Unknown", lastSeenAt: null, metrics: {} };
  }
}

function demoOrganisation() {
  const now = new Date();
  return {
    id: "demo",
    name: "Demo Workspace",
    slug: "demo-workspace",
    createdAt: now,
    updatedAt: now,
    connections: [],
    migrations: [],
    activityLogs: [],
  };
}
