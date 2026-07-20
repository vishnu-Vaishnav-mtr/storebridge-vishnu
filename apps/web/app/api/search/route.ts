import { NextResponse } from "next/server";
import { prisma } from "@storebridge/database";
import { getCurrentMembership } from "@/lib/session";

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const [stores, migrations, reports] = await Promise.all([
    prisma.storeConnection.findMany({
      where: {
        organisationId: membership.organisationId,
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { url: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, platform: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.migration.findMany({
      where: {
        organisationId: membership.organisationId,
        name: { contains: query, mode: "insensitive" },
      },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.report.findMany({
      where: {
        migration: { organisationId: membership.organisationId },
        title: { contains: query, mode: "insensitive" },
      },
      select: { id: true, title: true, type: true, migration: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    results: [
      ...stores.map((store) => ({
        id: store.id,
        type: "Store" as const,
        title: store.name,
        detail: `${store.platform} / ${store.status}`,
        href: "/stores",
      })),
      ...migrations.map((migration) => ({
        id: migration.id,
        type: "Migration" as const,
        title: migration.name,
        detail: migration.status,
        href: `/migrations/${migration.id}/setup`,
      })),
      ...reports.map((report) => ({
        id: report.id,
        type: "Report" as const,
        title: report.title,
        detail: `${report.migration.name} / ${report.type}`,
        href: `/api/reports/${report.id}`,
      })),
    ],
  });
}
