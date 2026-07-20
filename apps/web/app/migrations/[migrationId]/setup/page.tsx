import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  runMigrationJobAction,
  startAuditAction,
  updateMigrationModulesAction,
  updateMigrationStoresAction,
  warningDecisionAction,
} from "@/app/actions/migrations";
import { prisma } from "@storebridge/database";
import { getInfrastructureHealth } from "@/lib/health";
import { isUsableConnection } from "@/lib/migrations";
import { requireCurrentMembership } from "@/lib/session";

export const dynamic = "force-dynamic";

const steps = [
  "Select Stores",
  "Scan Source",
  "Select Data",
  "Configure Mapping",
  "Review Warnings",
  "Dry Run",
  "Migrate",
  "Verify",
];

export default async function MigrationSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ migrationId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ migrationId }, query, membership] = await Promise.all([
    params,
    searchParams,
    requireCurrentMembership(),
  ]);
  const [migration, health, connections] = await Promise.all([
    prisma.migration.findFirst({
      where: { id: migrationId, organisationId: membership.organisationId },
      include: {
        sourceConnection: true,
        targetConnection: true,
        modules: { orderBy: { entityType: "asc" } },
        auditResults: { orderBy: { entityType: "asc" } },
        errors: { orderBy: { createdAt: "desc" }, take: 8 },
        mappingRules: { orderBy: { createdAt: "desc" } },
        validationResults: { orderBy: { createdAt: "desc" }, take: 8 },
        records: { orderBy: { updatedAt: "desc" }, take: 20 },
        reports: { orderBy: { createdAt: "desc" }, take: 8 },
        checkpoints: { orderBy: { updatedAt: "desc" } },
        logs: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    }),
    getInfrastructureHealth(),
    prisma.storeConnection.findMany({
      where: { organisationId: membership.organisationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!migration) {
    return (
      <AppShell title="Migration not found" subtitle="The migration is unavailable.">
        <Card>
          <CardHeader
            title="Migration not found"
            description="This migration does not exist in your organisation."
          />
        </Card>
      </AppShell>
    );
  }

  const sources = connections.filter(
    (connection) =>
      connection.platform === "WOOCOMMERCE" && isUsableConnection(connection),
  );
  const destinations = connections.filter(
    (connection) =>
      connection.platform === "SHOPIFY" && isUsableConnection(connection),
  );
  const canEditStores = migration.status === "DRAFT";
  const workerOffline = health.worker.status === "Offline";

  return (
    <AppShell
      title="Migration Setup"
      subtitle={migration.name}
    >
      <div className="mb-4">
        <StatusBadge status={migration.status} />
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const current = stepNumber === migration.currentStep;
            const complete = stepNumber < migration.currentStep;
            return (
              <div
                key={step}
                className={`rounded-xl border p-3 ${
                  current
                    ? "border-green/40 bg-green/10"
                    : complete
                      ? "border-white/10 bg-white/8"
                      : "border-white/10 bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 text-green" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted" />
                  )}
                  <span className="text-xs text-muted">Step {stepNumber}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{step}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {query.error ? <Notice tone="danger" message={query.error} /> : null}
      {query.success ? <Notice tone="success" message={query.success} /> : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader
            title="1. Select Stores"
            description="Only connected stores from your organisation can be selected."
          />
          <form action={updateMigrationStoresAction} className="grid gap-4">
            <input type="hidden" name="migrationId" value={migration.id} />
            <StoreSelect
              label="WooCommerce source"
              name="sourceConnectionId"
              connections={sources}
              defaultValue={migration.sourceConnectionId}
              disabled={!canEditStores}
              emptyMessage="No source store found."
            />
            <StoreSelect
              label="Shopify destination"
              name="targetConnectionId"
              connections={destinations}
              defaultValue={migration.targetConnectionId}
              disabled={!canEditStores}
              emptyMessage="No destination store found."
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                variant="secondary"
                disabled={!canEditStores || sources.length === 0 || destinations.length === 0}
              >
                Save Store Selection
              </Button>
              {!canEditStores ? (
                <p className="self-center text-sm text-muted">
                  Stores cannot be changed after audit starts.
                </p>
              ) : null}
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="2. Scan Source"
            description="Connection checks run before the source audit is queued."
          />
          <div className="grid gap-3 text-sm">
            <HealthLine label="Redis queue" status={health.redis.status} />
            <HealthLine label="Worker" status={health.worker.status} />
            <HealthLine label="Source" status={migration.sourceConnection.status} />
            <HealthLine
              label="Destination"
              status={migration.targetConnection.status}
            />
          </div>
          {workerOffline ? (
            <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-100">
              Worker offline. Start the migration worker before audit starts.
            </p>
          ) : null}
          {migration.status === "AUDITING" ? (
            <div className="mt-4 rounded-xl border border-green/30 bg-green/10 p-4 text-sm text-green">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Source audit is running. This page will move to Step 3 after the
              worker saves audit results.
            </div>
          ) : null}
          <form action={startAuditAction} className="mt-4">
            <input type="hidden" name="migrationId" value={migration.id} />
            <Button
              type="submit"
              disabled={
                migration.status !== "DRAFT" ||
                workerOffline ||
                sources.length === 0 ||
                destinations.length === 0
              }
            >
              Start Source Audit
            </Button>
          </form>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="3. Select Data"
            description="Enabled modules are persisted for this migration."
          />
          <form action={updateMigrationModulesAction} className="grid gap-3">
            <input type="hidden" name="migrationId" value={migration.id} />
            <div className="grid gap-2 md:grid-cols-2">
            {migration.modules.map((module) => (
              <label
                key={module.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="modules"
                  value={module.entityType}
                  defaultChecked={module.enabled}
                  disabled={migration.currentStep < 3}
                  className="h-4 w-4 accent-green"
                />
                <span>
                  <span className="block font-semibold">{module.entityType}</span>
                  <span className="block text-muted">{module.status}</span>
                </span>
              </label>
            ))}
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={migration.currentStep < 3}
              className="w-fit"
            >
              Save Data Selection
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Audit Results" />
          <div className="grid gap-3">
            {migration.auditResults.length ? (
              migration.auditResults.map((result) => (
                <div
                  key={result.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <p className="font-semibold">
                    {result.entityType}: {result.detectedCount} detected
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {result.supportedCount} ready, {result.needsMapping} need
                    mapping, {result.unsupportedCount} unsupported
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                Audit results will appear after the worker completes the source
                scan.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="4. Configure Mapping"
            description="Categories and product attributes are mapped from the source records discovered by the audit."
          />
          <p className="rounded-xl border border-green/30 bg-green/10 p-3 text-sm text-green">
            WooCommerce categories become Shopify collections, product attributes
            become options, and source IDs are retained for reconciliation.
          </p>
          <div className="mt-4 grid gap-2">
            {migration.mappingRules.length ? (
              migration.mappingRules.map((rule) => (
                <p key={rule.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  {rule.ruleType}: {rule.sourceKey} - {rule.targetKey ?? rule.action}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted">No mapping rules saved yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="5. Review Warnings"
            description="Blocking issues must be resolved before dry run."
          />
          <IssueList migrationId={migration.id} errors={migration.errors} validations={migration.validationResults} />
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="6. Dry Run" />
          <JobActionForm
            migrationId={migration.id}
            action="dry-run"
            label="Run Dry Run"
            disabled={migration.currentStep < 5 || migration.status === "DRY_RUNNING"}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <JobActionForm migrationId={migration.id} action="cancel" label="Cancel Dry Run" variant="danger" disabled={migration.status !== "DRY_RUNNING"} />
            <JobActionForm migrationId={migration.id} action="dry-run" label="Retry Dry Run" variant="secondary" disabled={!["DRY_RUN_COMPLETE", "FAILED"].includes(migration.status)} />
          </div>
          <RecordSummary records={migration.records} />
        </Card>

        <Card>
          <CardHeader title="7. Migrate" />
          <JobActionForm
            migrationId={migration.id}
            action="start"
            label="Start Migration"
            disabled={!["DRY_RUN_COMPLETE", "READY", "COMPLETED_WITH_ERRORS"].includes(migration.status)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <JobActionForm migrationId={migration.id} action="pause" label="Pause" variant="secondary" disabled={migration.status !== "RUNNING"} />
            <JobActionForm migrationId={migration.id} action="resume" label="Resume" variant="secondary" disabled={migration.status !== "PAUSED"} />
            <JobActionForm migrationId={migration.id} action="retry-failed" label="Retry Failed Records" variant="secondary" disabled={migration.failedRecords === 0} />
            <JobActionForm migrationId={migration.id} action="cancel" label="Cancel" variant="danger" disabled={["COMPLETED", "VERIFIED", "CANCELLED"].includes(migration.status)} />
          </div>
          <CheckpointSummary checkpoints={migration.checkpoints} logs={migration.logs} />
        </Card>

        <Card>
          <CardHeader title="8. Verify" />
          <JobActionForm
            migrationId={migration.id}
            action="verify"
            label="Run Verification"
            disabled={!["COMPLETED", "COMPLETED_WITH_ERRORS", "PARTIALLY_VERIFIED", "VERIFICATION_FAILED"].includes(migration.status)}
          />
          <div className="mt-3 grid gap-2">
            {migration.reports.map((report) => (
              <a
                key={report.id}
                href={`/api/reports/${report.id}`}
                className="focus-ring rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              >
                {report.title} ({report.type})
              </a>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function StoreSelect({
  label,
  name,
  connections,
  defaultValue,
  disabled,
  emptyMessage,
}: {
  label: string;
  name: string;
  connections: Array<{ id: string; name: string; status: string }>;
  defaultValue: string;
  disabled: boolean;
  emptyMessage: string;
}) {
  if (connections.length === 0) {
    return (
      <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
        {emptyMessage}
      </p>
    );
  }

  return (
    <label className="grid gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3 text-surface disabled:opacity-60"
      >
        {connections.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.name} ({connection.status})
          </option>
        ))}
      </select>
    </label>
  );
}

function HealthLine({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
      <span>{label}</span>
      <span className="font-semibold text-muted">{status}</span>
    </div>
  );
}

function Notice({
  tone,
  message,
}: {
  tone: "success" | "danger";
  message: string;
}) {
  return (
    <div
      className={`mt-4 rounded-xl border p-4 text-sm ${
        tone === "success"
          ? "border-green/30 bg-green/10 text-green"
          : "border-danger/30 bg-danger/10 text-red-100"
      }`}
    >
      <AlertTriangle className="mr-2 inline h-4 w-4" />
      {message}
    </div>
  );
}

function IssueList({
  migrationId,
  errors,
  validations,
}: {
  migrationId: string;
  errors: Array<{
    id: string;
    category: string;
    message: string;
    sourceId: string | null;
    resolvedAt: Date | null;
  }>;
  validations: Array<{ id: string; stage: string; status: string; issues: unknown }>;
}) {
  const issueRows = [
    ...errors.map((error) => ({
      key: error.id,
      group: ["VALIDATION", "AUTHENTICATION", "PERMISSION", "MAPPING"].includes(
        error.category,
      )
        ? "Blocking"
        : error.category === "UNSUPPORTED_FEATURE"
          ? "Unsupported"
          : "Needs attention",
      message: error.message,
      sourceKey: error.sourceId ?? error.id,
      resolved: Boolean(error.resolvedAt),
    })),
    ...validations.flatMap((validation) =>
      Array.isArray(validation.issues)
        ? validation.issues.map((issue, index) => ({
            key: `${validation.id}-${index}`,
            group: "Informational",
            message:
              issue && typeof issue === "object" && "message" in issue
                ? String((issue as { message: unknown }).message)
                : validation.status,
            sourceKey: `${validation.stage}-${index}`,
            resolved: false,
          }))
        : [],
    ),
  ];

  if (issueRows.length === 0) {
    return (
      <p className="rounded-xl border border-green/30 bg-green/10 p-3 text-sm text-green">
        No blocking warnings are currently recorded.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {issueRows.map((issue) => (
        <div key={issue.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wide text-muted">{issue.group}</p>
          <p className="mt-1 text-sm">{issue.message}</p>
          <form action={warningDecisionAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="migrationId" value={migrationId} />
            <input type="hidden" name="sourceKey" value={issue.sourceKey} />
            <Button type="submit" name="action" value="RESOLVE" variant="secondary">
              Resolve
            </Button>
            <Button
              type="submit"
              name="action"
              value="APPLY_SUGGESTED_MAPPING"
              variant="ghost"
            >
              Apply Suggested Mapping
            </Button>
            <Button type="submit" name="action" value="SKIP_RECORD" variant="ghost">
              Skip Record
            </Button>
            <Button type="submit" name="action" value="INCLUDE_RECORD" variant="ghost">
              Include Record
            </Button>
          </form>
        </div>
      ))}
    </div>
  );
}

function JobActionForm({
  migrationId,
  action,
  label,
  disabled,
  variant = "primary",
}: {
  migrationId: string;
  action: string;
  label: string;
  disabled: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <form action={runMigrationJobAction} className="inline-flex">
      <input type="hidden" name="migrationId" value={migrationId} />
      <input type="hidden" name="action" value={action} />
      <Button type="submit" variant={variant} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

function RecordSummary({
  records,
}: {
  records: Array<{ id: string; entityType: string; status: string; sourceId: string }>;
}) {
  const counts = records.reduce<Record<string, number>>((accumulator, record) => {
    accumulator[record.status] = (accumulator[record.status] ?? 0) + 1;
    return accumulator;
  }, {});
  return (
    <div className="mt-4 grid gap-2 text-sm">
      {["NORMALIZED", "CREATED", "UPDATED", "DUPLICATE_PREVENTED", "SKIPPED", "FAILED"].map(
        (status) => (
          <p key={status} className="flex justify-between rounded-xl border border-white/10 bg-white/5 p-2">
            <span>{status}</span>
            <span>{counts[status] ?? 0}</span>
          </p>
        ),
      )}
    </div>
  );
}

function CheckpointSummary({
  checkpoints,
  logs,
}: {
  checkpoints: Array<{
    id: string;
    entityType: string;
    processed: number;
    lastSourceId: string | null;
    updatedAt: Date;
  }>;
  logs: Array<{ id: string; message: string; createdAt: Date }>;
}) {
  return (
    <div className="mt-4 grid gap-3 text-sm">
      {checkpoints.map((checkpoint) => (
        <p key={checkpoint.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
          {checkpoint.entityType}: {checkpoint.processed} processed, last{" "}
          {checkpoint.lastSourceId ?? "none"}
        </p>
      ))}
      {logs[0] ? (
        <p className="text-muted">
          Last activity: {logs[0].message} (
          {new Date(logs[0].createdAt).toLocaleString()})
        </p>
      ) : null}
    </div>
  );
}
