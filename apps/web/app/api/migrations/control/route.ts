import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import { prisma } from "@storebridge/database";
import {
  canTransitionMigration,
  migrationControlSchema,
} from "@storebridge/shared";

export async function POST(request: Request) {
  const input = migrationControlSchema.parse(await request.json());
  const migration = await prisma.migration.findUnique({
    where: { id: input.migrationId },
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
    await enqueue("resume", migration.id);
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "RESUMING" },
    });
    return NextResponse.json({
      message: "Migration is resuming from the last checkpoint.",
    });
  }

  if (input.action === "start") {
    await enqueue("start", migration.id);
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "QUEUED" },
    });
    return NextResponse.json({ message: "Migration has been queued." });
  }

  if (input.action === "retry-failed") {
    await enqueue("retry-failed", migration.id);
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
    await enqueue("verify", migration.id);
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "VERIFYING" },
    });
    return NextResponse.json({ message: "Verification has started." });
  }

  await enqueue("dry-run", migration.id);
  await prisma.migration.update({
    where: { id: migration.id },
    data: { status: "DRY_RUNNING" },
  });
  return NextResponse.json({ message: "Dry run has started." });
}

async function enqueue(action: string, migrationId: string) {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue("migrations", { connection });
  await queue.add(
    action,
    { migrationId, action },
    { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
  );
  await queue.close();
}

async function log(
  migrationId: string,
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "DEBUG",
  message: string,
) {
  await prisma.migrationLog.create({ data: { migrationId, level, message } });
}
