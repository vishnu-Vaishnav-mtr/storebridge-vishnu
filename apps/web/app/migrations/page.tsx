import { AlertTriangle, Download, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import {
  MigrationControls,
  LiveMigrationEvents,
} from "@/features/migrations/migration-controls";
import { getWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MigrationsPage() {
  const { organisation, progress } = await getWorkspaceData();
  const migration = organisation.migrations[0];

  return (
    <AppShell
      title="Migrations"
      subtitle="Monitor migration progress, pause safely, resume from checkpoints and retry failed records."
    >
      {migration ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader
              title={migration.name}
              action={<StatusBadge status={migration.status} />}
            />
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="green-gradient h-full"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Stat label="Total" value={migration.totalRecords} />
              <Stat label="Processed" value={migration.processedRecords} />
              <Stat label="Failed" value={migration.failedRecords} />
              <Stat
                label="Duplicates prevented"
                value={migration.duplicatesPrevented}
              />
            </div>
            <div className="mt-6">
              <MigrationControls migrationId={migration.id} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Live updates" />
            <LiveMigrationEvents migrationId={migration.id} />
          </Card>

          <Card>
            <CardHeader
              title="Error centre"
              description="Retry only records that are safe to retry."
            />
            <div className="space-y-3">
              {migration.errors.map((error) => (
                <div
                  key={error.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 text-warning" />{" "}
                    {error.name ?? error.sourceId}
                  </div>
                  <p className="mt-2 text-sm text-muted">{error.message}</p>
                  <p className="mt-2 text-xs text-muted">
                    {error.category} ·{" "}
                    {error.retryable ? "Retryable" : "Needs manual fix"}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Migration logs" />
            <div className="space-y-3">
              {migration.logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-sm">
                    <span className="text-green">{log.level}</span>{" "}
                    {log.message}
                  </p>
                  <details className="mt-2 text-xs text-muted">
                    <summary>Developer details</summary>
                    <pre className="mt-2 overflow-auto rounded-xl bg-ink p-3">
                      {JSON.stringify(log.details ?? {}, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Reports" />
            <div className="grid gap-3 md:grid-cols-3">
              {migration.reports.map((report) => (
                <a
                  key={report.id}
                  href={`/api/reports/${report.id}`}
                  className="focus-ring rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <FileText className="h-5 w-5 text-green" />
                  <p className="mt-2 font-semibold">{report.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {report.type} · {report.format}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-2 text-sm text-green">
                    <Download className="h-4 w-4" /> Download
                  </p>
                </a>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader
            title="No migrations yet"
            description="Create a migration after both stores are connected."
          />
        </Card>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
