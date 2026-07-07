import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { prisma } from "@storebridge/database";
import { getCurrentMembership } from "@/lib/session";

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const { searchParams } = new URL(request.url);
  const migrationId = searchParams.get("migrationId");
  if (!migrationId)
    return NextResponse.json(
      { error: "migrationId is required" },
      { status: 400 },
    );

  const migration = await prisma.migration.findFirst({
    where: { id: migrationId, organisationId: membership.organisationId },
    select: { id: true },
  });
  if (!migration)
    return NextResponse.json(
      { error: "Migration not found." },
      { status: 404 },
    );

  const encoder = new TextEncoder();
  if (!process.env.REDIS_URL) {
    return NextResponse.json(
      { error: "Redis queue is not configured." },
      { status: 503 },
    );
  }
  const stream = new ReadableStream({
    async start(controller) {
      const redis = new IORedis(process.env.REDIS_URL as string);
      const channel = `migration:${migrationId}:events`;
      await redis.subscribe(channel);
      controller.enqueue(
        encoder.encode(`data: Listening for migration updates\n\n`),
      );
      redis.on("message", (_channel, message) => {
        controller.enqueue(
          encoder.encode(`data: ${message.replaceAll("\n", " ")}\n\n`),
        );
      });
      request.signal.addEventListener("abort", () => {
        void redis.unsubscribe(channel).finally(() => redis.quit());
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
