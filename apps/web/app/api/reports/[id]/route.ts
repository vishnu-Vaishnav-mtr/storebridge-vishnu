import { NextResponse } from "next/server";
import { toCsv } from "@storebridge/migration-core";
import { getReportForDownload } from "@/lib/reports";
import { getCurrentMembership } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const membership = await getCurrentMembership();
  if (!membership)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const { id } = await params;
  const report = await getReportForDownload(id, membership.organisationId);
  if (!report)
    return NextResponse.json({ error: "Report not found." }, { status: 404 });

  if (report.objectKey && !process.env.OBJECT_STORAGE_PROVIDER) {
    return NextResponse.json(
      {
        error:
          "This report is stored in object storage, but object storage is not configured.",
      },
      { status: 503 },
    );
  }

  if (report.format === "CSV") {
    const rows = Array.isArray(report.content) ? report.content : [];
    return new Response(
      toCsv(rows as Array<Record<string, string | number | boolean | null | undefined>>),
      {
        headers: {
          "content-type": "text/csv",
          "content-disposition": `attachment; filename="${report.type.toLowerCase()}.csv"`,
        },
      },
    );
  }

  if (report.format === "HTML") {
    return new Response(
      `<main><h1>${escapeHtml(report.title)}</h1><pre>${escapeHtml(JSON.stringify(report.content, null, 2))}</pre></main>`,
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `attachment; filename="${report.type.toLowerCase()}.html"`,
        },
      },
    );
  }

  return NextResponse.json(report.content ?? {}, {
    headers: {
      "content-disposition": `attachment; filename="${report.type.toLowerCase()}.json"`,
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
}
