import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/session";
import { createMigrationForMember } from "@/lib/migrations";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (membership) {
    const limited = rateLimit({
      key: `migration-create:${membership.organisationId}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limited.ok) {
      return NextResponse.json(
        { ok: false, message: "Too many migration creation attempts." },
        { status: 429 },
      );
    }
  }

  const result = await createMigrationForMember({
    membership,
    body: await request.json().catch(() => ({})),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }

  return NextResponse.json(result, { status: result.reusedExisting ? 200 : 201 });
}
