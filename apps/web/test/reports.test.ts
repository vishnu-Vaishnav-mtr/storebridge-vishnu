import { describe, expect, it, vi } from "vitest";
import {
  buildReportWhere,
  getReportForDownload,
  getReportsForOrganisation,
} from "../lib/reports";

describe("reports", () => {
  it("builds organisation-scoped report filters", () => {
    expect(
      buildReportWhere("org_1", {
        migration: "migration_1",
        type: "DRY_RUN",
        format: "JSON",
      }),
    ).toEqual({
      migration: { organisationId: "org_1" },
      migrationId: "migration_1",
      type: "DRY_RUN",
      format: "JSON",
    });
  });

  it("returns a zero-state list when no reports exist", async () => {
    const db = {
      report: {
        findMany: vi.fn(async () => []),
      },
    };

    await expect(
      getReportsForOrganisation("org_1", {}, db as never),
    ).resolves.toEqual([]);
    expect(db.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { migration: { organisationId: "org_1" } },
      }),
    );
  });

  it("authorizes report downloads by organisation", async () => {
    const db = {
      report: {
        findFirst: vi.fn(async () => ({ id: "report_1", title: "Dry run" })),
      },
    };

    await expect(
      getReportForDownload("report_1", "org_1", db as never),
    ).resolves.toEqual({
      id: "report_1",
      title: "Dry run",
    });
    expect(db.report.findFirst).toHaveBeenCalledWith({
      where: { id: "report_1", migration: { organisationId: "org_1" } },
    });
  });

  it("does not authorize another organisation's report", async () => {
    const db = {
      report: {
        findFirst: vi.fn(async () => null),
      },
    };

    await expect(
      getReportForDownload("report_1", "org_2", db as never),
    ).resolves.toBeNull();
  });
});
