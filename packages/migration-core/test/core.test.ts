import { describe, expect, it } from "vitest";
import {
  buildDryRunResult,
  buildReconciliation,
  calculateProgress,
  detectRedirectLoops,
  enforceModuleDependencies,
  isRetryable,
  readinessScore,
} from "../src";

describe("migration core", () => {
  it("enforces module dependencies", () => {
    expect(enforceModuleDependencies(["inventory"])).toEqual(
      expect.arrayContaining(["inventory", "products", "variants"]),
    );
  });

  it("calculates readiness from actual audit results", () => {
    expect(
      readinessScore([
        {
          entityType: "PRODUCT",
          detectedCount: 10,
          supportedCount: 8,
          needsMapping: 1,
          warningCount: 1,
          unsupportedCount: 1,
          warnings: [],
        },
      ]),
    ).toBe(50);
  });

  it("blocks dry runs when dependencies are missing", () => {
    expect(buildDryRunResult(["orders"], [], 100).status).toBe(
      "MIGRATION_BLOCKED",
    );
  });

  it("calculates progress", () => {
    expect(
      calculateProgress({
        totalRecords: 100,
        processedRecords: 60,
        failedRecords: 10,
        duplicatesPrevented: 5,
      }),
    ).toEqual({
      percent: 70,
      successRate: 79,
    });
  });

  it("classifies retryable errors", () => {
    expect(isRetryable("VALIDATION")).toBe(false);
    expect(isRetryable("NETWORK")).toBe(true);
  });

  it("detects redirect loops", () => {
    expect(
      detectRedirectLoops([
        { from: "/a", to: "/b" },
        { from: "/b", to: "/a" },
      ]),
    ).toHaveLength(2);
  });

  it("builds reconciliation differences", () => {
    expect(
      buildReconciliation([
        {
          entity: "Products",
          source: 10,
          migrated: 8,
          updated: 1,
          skipped: 0,
          failed: 1,
        },
      ])[0]?.difference,
    ).toBe(0);
  });
});
