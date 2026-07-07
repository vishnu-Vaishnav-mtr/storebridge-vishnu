import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileWarning,
  Layers3,
  Repeat2,
  Store,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { getWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { organisation, metrics, progress, readiness, health } =
    await getWorkspaceData();
  const activeMigration = organisation.migrations[0];

  return (
    <AppShell
      title="Overview"
      subtitle="Your migration control room. Zero-state cards stay empty until real data or demo seed data exists."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Connected stores"
          value={metrics.connectedStores}
          icon={Store}
        />
        <MetricCard
          label="Active migrations"
          value={metrics.activeMigrations}
          icon={Layers3}
          tone="blue"
        />
        <MetricCard
          label="Completed migrations"
          value={metrics.completedMigrations}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Records migrated"
          value={metrics.recordsMigrated}
          icon={Database}
        />
        <MetricCard
          label="Records failed"
          value={metrics.recordsFailed}
          icon={FileWarning}
          tone="danger"
        />
        <MetricCard
          label="Duplicates prevented"
          value={metrics.duplicatesPrevented}
          icon={Repeat2}
          tone="warning"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Current migration"
            description="Real-time progress is persisted so refreshes do not lose state."
          />
          {activeMigration ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold">
                    {activeMigration.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {activeMigration.sourceConnection.name} →{" "}
                    {activeMigration.targetConnection.name}
                  </p>
                </div>
                <StatusBadge status={activeMigration.status} />
              </div>
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="green-gradient h-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                <Stat label="Progress" value={`${progress.percent}%`} />
                <Stat label="Success rate" value={`${progress.successRate}%`} />
                <Stat label="Readiness" value={`${readiness}%`} />
                <Stat label="Failed" value={activeMigration.failedRecords} />
              </div>
            </div>
          ) : (
            <Empty
              title="No migration yet"
              body="Create a migration after connecting your source and destination stores."
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="API and worker health"
            description="Infrastructure status is checked without exposing secrets."
          />
          <div className="grid gap-3">
            {[
              {
                label: "WooCommerce API",
                status: connectionStatus(
                  organisation.connections,
                  "WOOCOMMERCE",
                ),
              },
              {
                label: "WordPress API",
                status: connectionStatus(organisation.connections, "WORDPRESS"),
              },
              {
                label: "Shopify GraphQL API",
                status: connectionStatus(organisation.connections, "SHOPIFY"),
              },
              { label: "PostgreSQL", status: health.postgres.status },
              { label: "Redis", status: health.redis.status },
              { label: "Worker", status: health.worker.status },
              {
                label: "Object Storage",
                status: process.env.OBJECT_STORAGE_PROVIDER
                  ? "Not configured"
                  : "Not configured",
              },
              { label: "Real-time updates", status: health.redis.status },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="text-sm">{item.label}</span>
                <span className={`text-sm ${healthTone(item.status)}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Entity migration chart" />
          <div className="space-y-3">
            {(activeMigration?.auditResults ?? []).map((result) => (
              <div key={result.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{result.entityType}</span>
                  <span className="text-muted">
                    {result.supportedCount}/{result.detectedCount}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="green-gradient h-full"
                    style={{
                      width: `${result.detectedCount ? (result.supportedCount / result.detectedCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!activeMigration ? (
              <Empty
                title="No audit data"
                body="Run a source scan to populate readiness charts."
              />
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          <div className="space-y-3">
            {organisation.activityLogs.map((activity) => (
              <div
                key={activity.id}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <p className="text-sm">{activity.message}</p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(activity.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
            {organisation.activityLogs.length === 0 ? (
              <Empty
                title="No activity yet"
                body="Sensitive actions and migration events will appear here."
              />
            ) : null}
          </div>
        </Card>
      </div>

      {metrics.recordsFailed > 0 ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          Some records need your attention. Open Migrations to retry only
          retryable failures.
        </div>
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-5 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

function connectionStatus(
  connections: Array<{ platform: string; status: string }>,
  platform: "WOOCOMMERCE" | "WORDPRESS" | "SHOPIFY",
) {
  const connection = connections.find(
    (item) =>
      item.platform === platform || item.platform === `DEMO_${platform}`,
  );
  if (!connection) return "Not configured";
  if (connection.status === "CONNECTED") return "Healthy";
  if (
    connection.status === "CONNECTED_WITH_WARNINGS" ||
    connection.status === "PERMISSION_MISSING"
  )
    return "Degraded";
  return "Offline";
}

function healthTone(status: string) {
  if (status === "Healthy") return "text-green";
  if (status === "Degraded") return "text-warning";
  if (status === "Offline") return "text-red-100";
  return "text-muted";
}
