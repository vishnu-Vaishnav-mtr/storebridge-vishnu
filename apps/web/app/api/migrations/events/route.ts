import { NextResponse } from "next/server";
import IORedis from "ioredis";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const migrationId = searchParams.get("migrationId");
  if (!migrationId)
    return NextResponse.json(
      { error: "migrationId is required" },
      { status: 400 },
    );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const redis = new IORedis(
        process.env.REDIS_URL ?? "redis://localhost:6379",
      );
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
