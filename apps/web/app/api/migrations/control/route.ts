import { NextResponse } from "next/server";
import { prisma } from "@storebridge/database";
import {
  canTransitionMigration,
  migrationControlSchema,
} from "@storebridge/shared";
import { canOperateMigrations, getCurrentMembership } from "@/lib/session";
import { enqueueMigrationJob } from "@/lib/migration-queue";

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership)
    return NextResponse.json(
      { message: "Authentication required." },
      { status: 401 },
    );
  if (!canOperateMigrations(membership.role))
    return NextResponse.json(
      { message: "Insufficient permissions." },
      { status: 403 },
    );

  const input = migrationControlSchema.parse(await request.json());
  const migration = await prisma.migration.findFirst({
    where: { id: input.migrationId, organisationId: membership.organisationId },
  });
  if (!migration)
    return NextResponse.json(
      { message: "Migration not found." },
      { status: 404 },
    );

  if (input.action === "pause") {
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "PAUSING" },
    });
    await log(
      migration.id,
      "INFO",
      "Migration pause requested. StoreBridge will stop after the current record.",
    );
    return NextResponse.json({
      message: "Migration will pause after the current record.",
    });
  }

  if (input.action === "cancel") {
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "CANCELLED" },
    });
    await log(migration.id, "WARNING", "Migration cancelled by user.");
    return NextResponse.json({ message: "Migration has been cancelled." });
  }

  if (input.action === "resume") {
    if (!canTransitionMigration(migration.status as never, "RESUMING")) {
      return NextResponse.json(
        { message: "This migration cannot be resumed from its current state." },
        { status: 409 },
      );
    }
    const queued = await enqueueOrError(
      "resume",
      migration.id,
      "RESUMING",
      migration.status,
    );
    if (queued) return queued;
    return NextResponse.json({
      message: "Migration is resuming from the last checkpoint.",
    });
  }

  if (input.action === "start") {
    const queued = await enqueueOrError(
      "start",
      migration.id,
      "QUEUED",
      migration.status,
    );
    if (queued) return queued;
    return NextResponse.json({ message: "Migration has been queued." });
  }

  if (input.action === "retry-failed") {
    const queued = await enqueueOrError("retry-failed", migration.id);
    if (queued) return queued;
    await log(
      migration.id,
      "INFO",
      "Retry requested for failed retryable records.",
    );
    return NextResponse.json({
      message: "Retryable failed records have been queued.",
    });
  }

  if (input.action === "verify") {
    const queued = await enqueueOrError(
      "verify",
      migration.id,
      "VERIFYING",
      migration.status,
    );
    if (queued) return queued;
    return NextResponse.json({ message: "Verification has started." });
  }

  const queued = await enqueueOrError(
    "dry-run",
    migration.id,
    "DRY_RUNNING",
    migration.status,
  );
  if (queued) return queued;
  return NextResponse.json({ message: "Dry run has started." });
}

async function log(
  migrationId: string,
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "DEBUG",
  message: string,
) {
  await prisma.migrationLog.create({ data: { migrationId, level, message } });
}

async function enqueueOrError(
  action: string,
  migrationId: string,
  pendingStatus?: Parameters<typeof prisma.migration.update>[0]["data"]["status"],
  previousStatus?: Parameters<typeof prisma.migration.update>[0]["data"]["status"],
) {
  try {
    if (pendingStatus) {
      await prisma.migration.update({
        where: { id: migrationId },
        data: { status: pendingStatus },
      });
    }
    await enqueueMigrationJob(action, migrationId);
    return null;
  } catch {
    if (pendingStatus && previousStatus) {
      await prisma.migration.update({
        where: { id: migrationId },
        data: { status: previousStatus },
      });
    }
    return NextResponse.json(
      { message: "Redis queue failure. Job was not queued." },
      { status: 503 },
    );
  }
}
