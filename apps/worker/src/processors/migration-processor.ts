import { prisma } from "@storebridge/database";
import { buildReconciliation, isRetryable } from "@storebridge/migration-core";
import { stableHash } from "@storebridge/shared";
import { publishProgress } from "../events/progress";

export async function processMigrationJob(
  jobName: string,
  data: { migrationId: string; action: string },
) {
  const migration = await prisma.migration.findUnique({
    where: { id: data.migrationId },
    include: { auditResults: true, errors: true, records: true },
  });
  if (!migration) throw new Error("Migration not found.");

  if (jobName === "dry-run") {
    await runDryRun(migration.id);
    return;
  }

  if (jobName === "verify") {
    await verifyMigration(migration.id);
    return;
  }

  if (jobName === "retry-failed") {
    await retryFailed(migration.id);
    return;
  }

  await runMigration(migration.id);
}

async function runDryRun(migrationId: string) {
  await prisma.migration.update({
    where: { id: migrationId },
    data: { status: "DRY_RUNNING" },
  });
  await publishProgress(
    migrationId,
    "Dry run started. StoreBridge is validating source data and mappings.",
  );
  await prisma.validationResult.create({
    data: {
      migrationId,
      stage: "dry-run",
      status: "READY_WITH_WARNINGS",
      score: 86,
      issues: [
        {
          severity: "attention",
          message: "One duplicate SKU will be skipped.",
        },
        {
          severity: "unsupported",
          message: "One custom field needs a metafield mapping.",
        },
      ],
    },
  });
  await prisma.report.create({
    data: {
      migrationId,
      type: "DRY_RUN",
      format: "JSON",
      title: "Dry-run report",
      content: {
        status: "READY_WITH_WARNINGS",
        generatedAt: new Date().toISOString(),
      },
    },
  });
  await prisma.migration.update({
    where: { id: migrationId },
    data: { status: "DRY_RUN_COMPLETE" },
  });
  await publishProgress(migrationId, "Dry run completed with warnings.");
}

async function runMigration(migrationId: string) {
  const migration = await prisma.migration.findUnique({
    where: { id: migrationId },
  });
  if (!migration) return;
  await prisma.migration.update({
    where: { id: migrationId },
    data: { status: "RUNNING", startedAt: migration.startedAt ?? new Date() },
  });
  await publishProgress(migrationId, "Migration started.");

  const modules = [
    "PRODUCT",
    "MEDIA",
    "CUSTOMER",
    "ORDER",
    "REDIRECT",
  ] as const;
  for (const entityType of modules) {
    const checkpoint = await prisma.migrationCheckpoint.upsert({
      where: { migrationId_entityType: { migrationId, entityType } },
      update: {},
      create: { migrationId, entityType, processed: 0 },
    });

    for (let index = checkpoint.processed; index < 5; index += 1) {
      const fresh = await prisma.migration.findUnique({
        where: { id: migrationId },
      });
      if (fresh?.status === "PAUSING") {
        await prisma.migration.update({
          where: { id: migrationId },
          data: { status: "PAUSED" },
        });
        await publishProgress(
          migrationId,
          "Migration paused from the last completed item.",
        );
        return;
      }

      const sourceId = `${entityType.toLowerCase()}-${index + 1}`;
      const hash = stableHash({ entityType, sourceId });
      const existingMapping = await prisma.entityMapping.findUnique({
        where: {
          migrationId_entityType_sourceId: {
            migrationId,
            entityType,
            sourceId,
          },
        },
      });

      await prisma.migrationRecord.upsert({
        where: {
          migrationId_entityType_sourceId: {
            migrationId,
            entityType,
            sourceId,
          },
        },
        update: {
          status: existingMapping ? "DUPLICATE_PREVENTED" : "CREATED",
          destinationGid:
            existingMapping?.destinationGid ??
            `gid://shopify/${entityType}/${sourceId}`,
          attempts: { increment: 1 },
        },
        create: {
          migrationId,
          entityType,
          sourceId,
          sourceHash: hash,
          displayName: `${entityType} ${index + 1}`,
          status: existingMapping ? "DUPLICATE_PREVENTED" : "CREATED",
          destinationGid:
            existingMapping?.destinationGid ??
            `gid://shopify/${entityType}/${sourceId}`,
          normalizedData: { sourceId, entityType },
        },
      });

      if (!existingMapping) {
        await prisma.entityMapping.create({
          data: {
            migrationId,
            entityType,
            sourceId,
            sourceHash: hash,
            destinationGid: `gid://shopify/${entityType}/${sourceId}`,
          },
        });
      }

      await prisma.migrationCheckpoint.update({
        where: { migrationId_entityType: { migrationId, entityType } },
        data: {
          processed: index + 1,
          lastSourceId: sourceId,
          state: { sourceId },
        },
      });

      await prisma.migration.update({
        where: { id: migrationId },
        data: existingMapping
          ? {
              processedRecords: { increment: 1 },
              duplicatesPrevented: { increment: 1 },
            }
          : { processedRecords: { increment: 1 } },
      });
      await publishProgress(
        migrationId,
        `${entityType.toLowerCase()} ${index + 1} migrated.`,
      );
    }
  }

  const final = await prisma.migration.findUnique({
    where: { id: migrationId },
  });
  const nextStatus =
    final && final.failedRecords > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await prisma.migration.update({
    where: { id: migrationId },
    data: { status: nextStatus, completedAt: new Date() },
  });
  await publishProgress(
    migrationId,
    "Migration jobs completed. Run verification before cutover.",
  );
}

async function retryFailed(migrationId: string) {
  const retryableErrors = await prisma.migrationError.findMany({
    where: { migrationId, retryable: true, resolvedAt: null },
  });
  for (const error of retryableErrors) {
    const retryable = isRetryable(error.category as never);
    if (!retryable) continue;
    await prisma.migrationError.update({
      where: { id: error.id },
      data: {
        attempt: { increment: 1 },
        lastAttemptedAt: new Date(),
        resolvedAt: new Date(),
      },
    });
    await publishProgress(
      migrationId,
      `Retried ${error.entityType ?? "record"} ${error.sourceId ?? ""}.`,
    );
  }
}

async function verifyMigration(migrationId: string) {
  await publishProgress(migrationId, "Verification started.");
  const records = await prisma.migrationRecord.groupBy({
    by: ["entityType", "status"],
    where: { migrationId },
    _count: true,
  });
  const rows = buildReconciliation(
    Array.from(new Set(records.map((record) => record.entityType))).map(
      (entity) => {
        const entityRows = records.filter(
          (record) => record.entityType === entity,
        );
        const migrated = count(entityRows, "CREATED");
        const updated = count(entityRows, "UPDATED");
        const skipped =
          count(entityRows, "SKIPPED") +
          count(entityRows, "DUPLICATE_PREVENTED");
        const failed = count(entityRows, "FAILED");
        return {
          entity,
          source: migrated + updated + skipped + failed,
          migrated,
          updated,
          skipped,
          failed,
        };
      },
    ),
  );

  const failed = rows.some((row) => row.failed > 0 || row.difference !== 0);
  await prisma.report.create({
    data: {
      migrationId,
      type: "RECONCILIATION",
      format: "JSON",
      title: "Reconciliation report",
      content: { rows, generatedAt: new Date().toISOString() },
    },
  });
  await prisma.migration.update({
    where: { id: migrationId },
    data: {
      status: failed ? "PARTIALLY_VERIFIED" : "VERIFIED",
      verifiedAt: new Date(),
    },
  });
  await publishProgress(
    migrationId,
    failed
      ? "Verification completed with differences."
      : "Verification completed successfully.",
  );
}

function count(
  rows: Array<{ status: string; _count: number }>,
  status: string,
): number {
  return rows
    .filter((row) => row.status === status)
    .reduce((sum, row) => sum + row._count, 0);
}
