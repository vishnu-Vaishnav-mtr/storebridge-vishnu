import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/session";
import { createMigrationForMember } from "@/lib/migrations";

export async function POST(request: Request) {
  const result = await createMigrationForMember({
    membership: await getCurrentMembership(),
    body: await request.json().catch(() => ({})),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }

  return NextResponse.json(result, { status: result.reusedExisting ? 200 : 201 });
}
