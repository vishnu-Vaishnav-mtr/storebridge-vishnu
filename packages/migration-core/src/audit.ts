import type { AuditEntityResult } from "@storebridge/shared";

export function readinessScore(results: AuditEntityResult[]): number {
  const totals = results.reduce(
    (acc, result) => {
      acc.detected += result.detectedCount;
      acc.ready += result.supportedCount;
      acc.penalty += result.needsMapping + result.unsupportedCount * 2;
      return acc;
    },
    { detected: 0, ready: 0, penalty: 0 },
  );

  if (totals.detected === 0) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(((totals.ready - totals.penalty) / totals.detected) * 100),
    ),
  );
}
