"use server";

import { redirect } from "next/navigation";
import { prisma } from "@storebridge/database";
import { z } from "zod";
import { recheckStoreConnection } from "@/lib/connection-checks";
import { checkWorkerHealth } from "@/lib/health";
import { enqueueMigrationJob } from "@/lib/migration-queue";
import { isUsableConnection, supportedMigrationModules } from "@/lib/migrations";
import { requireCurrentMembership } from "@/lib/session";

const storeSelectionSchema = z.object({
  migrationId: z.string().min(1),
  sourceConnectionId: z.string().min(1),
  targetConnectionId: z.string().min(1),
});

const startAuditSchema = z.object({
  migrationId: z.string().min(1),
});

const moduleSelectionSchema = z.object({
  migrationId: z.string().min(1),
  modules: z.array(z.enum(supportedMigrationModules)).min(1),
});

export async function updateMigrationStoresAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const input = storeSelectionSchema.parse({
    migrationId: formData.get("migrationId"),
    sourceConnectionId: formData.get("sourceConnectionId"),
    targetConnectionId: formData.get("targetConnectionId"),
  });

  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
  });
  if (!migration) redirect("/migrations");
  if (migration.status !== "DRAFT") {
    redirect(wizardUrl(input.migrationId, "Invalid migration state."));
  }

  const [source, target] = await Promise.all([
    prisma.storeConnection.findFirst({
      where: {
        id: input.sourceConnectionId,
        organisationId: membership.organisationId,
        platform: "WOOCOMMERCE",
        deletedAt: null,
      },
    }),
    prisma.storeConnection.findFirst({
      where: {
        id: input.targetConnectionId,
        organisationId: membership.organisationId,
        platform: "SHOPIFY",
        deletedAt: null,
      },
    }),
  ]);

  if (!source) redirect(wizardUrl(input.migrationId, "No source store found."));
  if (!target)
    redirect(wizardUrl(input.migrationId, "No destination store found."));
  if (!isUsableConnection(source))
    redirect(wizardUrl(input.migrationId, "Disconnected source store."));
  if (!isUsableConnection(target))
    redirect(wizardUrl(input.migrationId, "Disconnected destination store."));

  await prisma.migration.update({
    where: { id: migration.id },
    data: {
      sourceConnectionId: source.id,
      targetConnectionId: target.id,
      configuration: {
        upsert: {
          create: {
            modules: {},
            mappings: {},
            options: {
              sourceConnectionId: source.id,
              targetConnectionId: target.id,
            },
          },
          update: {
            options: {
              sourceConnectionId: source.id,
              targetConnectionId: target.id,
            },
          },
        },
      },
    },
  });

  redirect(wizardUrl(input.migrationId, null, "Store selection saved."));
}

export async function startAuditAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const input = startAuditSchema.parse({
    migrationId: formData.get("migrationId"),
  });
  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
    include: { sourceConnection: true, targetConnection: true },
  });
  if (!migration) redirect("/migrations");
  if (migration.status !== "DRAFT") {
    redirect(wizardUrl(input.migrationId, "Invalid migration state."));
  }

  if (!isUsableConnection(migration.sourceConnection)) {
    redirect(wizardUrl(input.migrationId, "Disconnected source store."));
  }
  if (!isUsableConnection(migration.targetConnection)) {
    redirect(wizardUrl(input.migrationId, "Disconnected destination store."));
  }

  const worker = await checkWorkerHealth();
  if (worker.status === "Offline") {
    redirect(wizardUrl(input.migrationId, "Worker offline. Start the migration worker before audit starts."));
  }

  const [sourceCheck, targetCheck] = await Promise.all([
    recheckStoreConnection(
      migration.sourceConnectionId,
      membership.organisationId,
    ),
    recheckStoreConnection(
      migration.targetConnectionId,
      membership.organisationId,
    ),
  ]);
  if (!sourceCheck.ok) {
    redirect(
      wizardUrl(
        input.migrationId,
        sourceCheck.missingPermissions.length
          ? "Missing API permissions on the source store."
          : "Disconnected source store.",
      ),
    );
  }
  if (!targetCheck.ok) {
    redirect(
      wizardUrl(
        input.migrationId,
        targetCheck.missingPermissions.length
          ? "Missing API permissions on the destination store."
          : "Disconnected destination store.",
      ),
    );
  }

  try {
    await enqueueMigrationJob("audit", migration.id);
  } catch {
    redirect(wizardUrl(input.migrationId, "Redis queue failure. Audit was not queued."));
  }

  await prisma.migration.update({
    where: { id: migration.id },
    data: { status: "AUDITING", currentStep: 2 },
  });

  redirect(wizardUrl(input.migrationId, null, "Source audit queued."));
}

export async function updateMigrationModulesAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const input = moduleSelectionSchema.parse({
    migrationId: formData.get("migrationId"),
    modules: formData.getAll("modules"),
  });
  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
    select: { id: true, currentStep: true },
  });
  if (!migration) redirect("/migrations");

  await prisma.$transaction([
    prisma.migrationModule.updateMany({
      where: { migrationId: migration.id },
      data: { enabled: false, status: "SKIPPED" },
    }),
    ...input.modules.map((entityType) =>
      prisma.migrationModule.upsert({
        where: {
          migrationId_entityType: {
            migrationId: migration.id,
            entityType,
          },
        },
        update: { enabled: true, status: "SELECTED" },
        create: {
          migrationId: migration.id,
          entityType,
          enabled: true,
          status: "SELECTED",
        },
      }),
    ),
    prisma.migration.update({
      where: { id: migration.id },
      data: {
        currentStep: Math.max(migration.currentStep, 4),
        configuration: {
          update: {
            modules: Object.fromEntries(
              supportedMigrationModules.map((entityType) => [
                entityType,
                input.modules.includes(entityType),
              ]),
            ),
          },
        },
      },
    }),
  ]);

  redirect(wizardUrl(input.migrationId, null, "Data selection saved."));
}

function wizardUrl(migrationId: string, error?: string | null, success?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (success) params.set("success", success);
  const query = params.toString();
  return `/migrations/${migrationId}/setup${query ? `?${query}` : ""}`;
}
