import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { getReportsForOrganisation } from "@/lib/reports";
import { requireCurrentMembership } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const membership = await requireCurrentMembership();
  const reports = await getReportsForOrganisation(membership.organisationId);

  return (
    <AppShell
      title="Reports"
      subtitle="Audit, dry-run, migration, and reconciliation reports generated from real migration data."
    >
      <Card>
        <CardHeader title="Generated reports" />
        <div className="grid gap-3">
          {reports.map((report) => (
            <a
              key={report.id}
              href={`/api/reports/${report.id}`}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="font-semibold">{report.title}</p>
              <p className="mt-1 text-sm text-muted">
                {report.migration.name} / {report.type} / {report.format} /{" "}
                {report.createdAt.toLocaleString()}
              </p>
            </a>
          ))}
          {reports.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-muted">
              Reports will appear after an audit, dry run, or verification.
            </p>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}
