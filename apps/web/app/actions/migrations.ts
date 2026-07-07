"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@storebridge/database";
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

const mappingRuleSchema = z.object({
  migrationId: z.string().min(1),
  rules: z
    .array(
      z.object({
        ruleType: z.enum([
          "CATEGORY",
          "ATTRIBUTE",
          "CUSTOM_FIELD",
          "WORDPRESS_PAGE",
          "WORDPRESS_POST",
          "WORDPRESS_CATEGORY",
          "ORDER_STATUS",
          "UNSUPPORTED_DATA",
        ]),
        sourceKey: z.string().trim().min(1).max(200),
        targetKey: z.string().trim().max(200).optional(),
        action: z.enum([
          "COLLECTION",
          "OPTION",
          "METAFIELD",
          "TAG",
          "PAGE",
          "BLOG_ARTICLE",
          "ORDER_METADATA",
          "REPORT_UNSUPPORTED",
          "SKIP",
        ]),
      }),
    )
    .min(1),
});

const warningDecisionSchema = z.object({
  migrationId: z.string().min(1),
  sourceKey: z.string().min(1),
  action: z.enum([
    "RESOLVE",
    "APPLY_SUGGESTED_MAPPING",
    "SKIP_RECORD",
    "INCLUDE_RECORD",
  ]),
});

const migrationJobSchema = z.object({
  migrationId: z.string().min(1),
  action: z.enum([
    "dry-run",
    "start",
    "pause",
    "resume",
    "cancel",
    "retry-failed",
    "verify",
  ]),
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

export async function saveMappingRulesAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const migrationId = String(formData.get("migrationId") ?? "");
  const ruleCount = Number(formData.get("ruleCount") ?? 0);
  const rules = Array.from({ length: ruleCount }, (_, index) => ({
    ruleType: formData.get(`rules.${index}.ruleType`),
    sourceKey: formData.get(`rules.${index}.sourceKey`),
    targetKey: formData.get(`rules.${index}.targetKey`) || undefined,
    action: formData.get(`rules.${index}.action`),
  }));
  const input = mappingRuleSchema.parse({ migrationId, rules });
  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
    select: { id: true, currentStep: true, status: true },
  });
  if (!migration) redirect("/migrations");
  if (!["READY", "DRAFT"].includes(migration.status)) {
    redirect(wizardUrl(input.migrationId, "Invalid migration state."));
  }

  await prisma.$transaction([
    prisma.mappingRule.deleteMany({
      where: {
        migrationId: input.migrationId,
        ruleType: {
          in: [
            "CATEGORY",
            "ATTRIBUTE",
            "CUSTOM_FIELD",
            "WORDPRESS_PAGE",
            "WORDPRESS_POST",
            "WORDPRESS_CATEGORY",
            "ORDER_STATUS",
            "UNSUPPORTED_DATA",
          ],
        },
      },
    }),
    ...input.rules.map((rule) =>
      prisma.mappingRule.create({
        data: {
          migrationId: input.migrationId,
          ruleType: rule.ruleType,
          sourceKey: rule.sourceKey,
          targetKey: rule.targetKey ?? null,
          action: rule.action,
          options: suggestedOptions(rule) as Prisma.InputJsonObject,
        },
      }),
    ),
    prisma.migration.update({
      where: { id: input.migrationId },
      data: { currentStep: Math.max(migration.currentStep, 5) },
    }),
  ]);

  redirect(wizardUrl(input.migrationId, null, "Mapping rules saved."));
}

export async function resetMappingRulesAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const migrationId = String(formData.get("migrationId") ?? "");
  const migration = await prisma.migration.findFirst({
    where: { id: migrationId, organisationId: membership.organisationId },
    select: { id: true },
  });
  if (!migration) redirect("/migrations");
  await prisma.mappingRule.deleteMany({
    where: {
      migrationId,
      ruleType: {
        in: [
          "CATEGORY",
          "ATTRIBUTE",
          "CUSTOM_FIELD",
          "WORDPRESS_PAGE",
          "WORDPRESS_POST",
          "WORDPRESS_CATEGORY",
          "ORDER_STATUS",
          "UNSUPPORTED_DATA",
        ],
      },
    },
  });
  redirect(wizardUrl(migrationId, null, "Mapping rules reset."));
}

export async function warningDecisionAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const input = warningDecisionSchema.parse({
    migrationId: formData.get("migrationId"),
    sourceKey: formData.get("sourceKey"),
    action: formData.get("action"),
  });
  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
    select: { id: true, currentStep: true },
  });
  if (!migration) redirect("/migrations");
  await prisma.mappingRule.create({
    data: {
      migrationId: input.migrationId,
      ruleType: "WARNING_RESOLUTION",
      sourceKey: input.sourceKey,
      action: input.action,
      options: { decidedAt: new Date().toISOString() },
    },
  });
  await prisma.migration.update({
    where: { id: input.migrationId },
    data: { currentStep: Math.max(migration.currentStep, 6) },
  });
  redirect(wizardUrl(input.migrationId, null, "Warning decision saved."));
}

export async function runMigrationJobAction(formData: FormData) {
  const membership = await requireCurrentMembership();
  const input = migrationJobSchema.parse({
    migrationId: formData.get("migrationId"),
    action: formData.get("action"),
  });
  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
    include: { sourceConnection: true, targetConnection: true },
  });
  if (!migration) redirect("/migrations");

  if (input.action === "dry-run") {
    const blocking = await hasBlockingIssues(input.migrationId);
    if (blocking) {
      redirect(
        wizardUrl(
          input.migrationId,
          "Blocking issues must be resolved before dry run.",
        ),
      );
    }
  }

  if (["dry-run", "start"].includes(input.action)) {
    if (!isUsableConnection(migration.sourceConnection)) {
      redirect(wizardUrl(input.migrationId, "Disconnected source store."));
    }
    if (!isUsableConnection(migration.targetConnection)) {
      redirect(wizardUrl(input.migrationId, "Disconnected destination store."));
    }
    const worker = await checkWorkerHealth();
    if (worker.status === "Offline") {
      redirect(wizardUrl(input.migrationId, "Worker offline. Start the migration worker first."));
    }
  }

  if (input.action === "cancel") {
    await prisma.migration.update({
      where: { id: input.migrationId },
      data: { status: "CANCELLED" },
    });
    redirect(wizardUrl(input.migrationId, null, "Migration cancelled."));
  }

  try {
    await enqueueMigrationJob(input.action, input.migrationId);
  } catch {
    redirect(wizardUrl(input.migrationId, "Redis queue failure. Job was not queued."));
  }

  const statusByAction = {
    "dry-run": "DRY_RUNNING",
    start: "QUEUED",
    pause: "PAUSING",
    resume: "RESUMING",
    "retry-failed": migration.status,
    verify: "VERIFYING",
  } as const;
  const nextStatus = statusByAction[input.action as keyof typeof statusByAction];
  if (nextStatus) {
    await prisma.migration.update({
      where: { id: input.migrationId },
      data: {
        status: nextStatus,
        currentStep:
          input.action === "dry-run"
            ? 6
            : input.action === "start"
              ? 7
              : input.action === "verify"
                ? 8
                : migration.currentStep,
      },
    });
  }

  redirect(wizardUrl(input.migrationId, null, `${input.action} queued.`));
}

function wizardUrl(migrationId: string, error?: string | null, success?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (success) params.set("success", success);
  const query = params.toString();
  return `/migrations/${migrationId}/setup${query ? `?${query}` : ""}`;
}

async function hasBlockingIssues(migrationId: string) {
  const unresolvedErrors = await prisma.migrationError.count({
    where: {
      migrationId,
      resolvedAt: null,
      category: { in: ["VALIDATION", "AUTHENTICATION", "PERMISSION", "MAPPING"] },
    },
  });
  return unresolvedErrors > 0;
}

function suggestedOptions(rule: {
  ruleType: string;
  sourceKey: string;
  action: string;
  targetKey?: string | undefined;
}) {
  return {
    suggested: true,
    sourceKey: rule.sourceKey,
    targetKey: rule.targetKey ?? null,
    action: rule.action,
  };
}
