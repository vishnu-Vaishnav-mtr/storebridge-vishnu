import { NextResponse } from "next/server";
import { prisma } from "@storebridge/database";
import { recheckStoreConnection } from "@/lib/connection-checks";
import { canManageConnections, getCurrentMembership } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const membership = await getCurrentMembership();
  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!canManageConnections(membership.role)) {
    return NextResponse.json(
      { ok: false, error: "Insufficient permissions." },
      { status: 403 },
    );
  }

  const { connectionId } = await params;
  const body = await request.json().catch(() => ({}));
  const connection = await prisma.storeConnection.findFirst({
    where: {
      id: connectionId,
      organisationId: membership.organisationId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!connection) {
    return NextResponse.json(
      { ok: false, error: "Connection not found." },
      { status: 404 },
    );
  }

  if (body.action === "disconnect") {
    await prisma.storeConnection.update({
      where: { id: connectionId },
      data: { status: "DISCONNECTED" },
    });
    return NextResponse.json({ ok: true, status: "DISCONNECTED" });
  }

  if (body.action === "recheck") {
    try {
      const result = await recheckStoreConnection(
        connectionId,
        membership.organisationId,
      );
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          status: "CONNECTION_FAILED",
          error:
            error instanceof Error ? error.message : "Connection recheck failed.",
        },
        { status: 400 },
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Unsupported connection action." },
    { status: 400 },
  );
}
