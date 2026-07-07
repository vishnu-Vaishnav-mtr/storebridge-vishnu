import { NextResponse } from "next/server";
import { prisma } from "@storebridge/database";
import {
  canTransitionMigration,
  migrationControlSchema,
} from "@storebridge/shared";
import { getCurrentMembership } from "@/lib/session";
import { enqueueMigrationJob } from "@/lib/migration-queue";

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership)
    return NextResponse.json(
      { message: "Authentication required." },
      { status: 401 },
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

  if (input.action === "resume") {
    if (!canTransitionMigration(migration.status as never, "RESUMING")) {
      return NextResponse.json(
        { message: "This migration cannot be resumed from its current state." },
        { status: 409 },
      );
    }
    await enqueueMigrationJob("resume", migration.id);
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "RESUMING" },
    });
    return NextResponse.json({
      message: "Migration is resuming from the last checkpoint.",
    });
  }

  if (input.action === "start") {
    await enqueueMigrationJob("start", migration.id);
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "QUEUED" },
    });
    return NextResponse.json({ message: "Migration has been queued." });
  }

  if (input.action === "retry-failed") {
    await enqueueMigrationJob("retry-failed", migration.id);
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
    await enqueueMigrationJob("verify", migration.id);
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "VERIFYING" },
    });
    return NextResponse.json({ message: "Verification has started." });
  }

  await enqueueMigrationJob("dry-run", migration.id);
  await prisma.migration.update({
    where: { id: migration.id },
    data: { status: "DRY_RUNNING" },
  });
  return NextResponse.json({ message: "Dry run has started." });
}

async function log(
  migrationId: string,
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "DEBUG",
  message: string,
) {
  await prisma.migrationLog.create({ data: { migrationId, level, message } });
}
