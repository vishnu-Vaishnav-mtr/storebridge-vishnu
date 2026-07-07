import type { AuditEntityResult } from "@storebridge/shared";
import { missingDependencies, type MigrationModuleKey } from "./dependencies";

export interface DryRunIssue {
  severity: "blocking" | "attention" | "info" | "unsupported";
  message: string;
  entityType?: string;
}

export interface DryRunResult {
  status: "READY_TO_MIGRATE" | "READY_WITH_WARNINGS" | "MIGRATION_BLOCKED";
  issues: DryRunIssue[];
  estimatedOperations: number;
  readinessScore: number;
}

export function buildDryRunResult(
  selectedModules: MigrationModuleKey[],
  auditResults: AuditEntityResult[],
  score: number,
): DryRunResult {
  const issues: DryRunIssue[] = [];
  for (const missing of missingDependencies(selectedModules)) {
    issues.push({
      severity: "blocking",
      message: `${missing.module} requires ${missing.dependency}.`,
    });
  }

  for (const result of auditResults) {
    if (result.unsupportedCount > 0) {
      issues.push({
        severity: "unsupported",
        entityType: result.entityType,
        message: `${result.unsupportedCount} ${result.entityType.toLowerCase()} records are unsupported and will be reported.`,
      });
    }
    if (result.warningCount > 0) {
      issues.push({
        severity: "attention",
        entityType: result.entityType,
        message: `${result.warningCount} ${result.entityType.toLowerCase()} records need attention before migration.`,
      });
    }
  }

  const estimatedOperations = auditResults.reduce(
    (sum, result) => sum + result.supportedCount,
    0,
  );
  const hasBlocker = issues.some((issue) => issue.severity === "blocking");
  const hasWarning = issues.some((issue) => issue.severity !== "info");

  return {
    status: hasBlocker
      ? "MIGRATION_BLOCKED"
      : hasWarning
        ? "READY_WITH_WARNINGS"
        : "READY_TO_MIGRATE",
    issues,
    estimatedOperations,
    readinessScore: score,
  };
}
