import type { Prisma } from "@prisma/client";
import { prisma, type PrismaClient } from "@storebridge/database";

type Db = PrismaClient;

export interface ReportFilters {
  migration?: string;
  type?: string;
  format?: string;
}

export function buildReportWhere(
  organisationId: string,
  filters: ReportFilters = {},
): Prisma.ReportWhereInput {
  const where: Prisma.ReportWhereInput = {
    migration: { organisationId },
  };
  if (filters.migration) where.migrationId = filters.migration;
  if (filters.type) where.type = filters.type as never;
  if (filters.format) where.format = filters.format as never;
  return where;
}

export async function getReportsForOrganisation(
  organisationId: string,
  filters: ReportFilters = {},
  db: Db = prisma,
) {
  return db.report.findMany({
    where: buildReportWhere(organisationId, filters),
    include: {
      migration: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getReportForDownload(
  reportId: string,
  organisationId: string,
  db: Db = prisma,
) {
  return db.report.findFirst({
    where: {
      id: reportId,
      migration: { organisationId },
    },
  });
}
