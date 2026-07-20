import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  canStartSourceAudit,
  createMigrationForMember,
  migrationCreateAvailability,
  supportedMigrationModules,
} from "../lib/migrations";

const membership = {
  userId: "user_1",
  email: "owner@example.com",
  name: "Owner",
  organisationId: "org_1",
  role: "OWNER" as const,
};

const woo = {
  id: "woo_1",
  organisationId: "org_1",
  name: "Woo",
  platform: "WOOCOMMERCE",
  status: "CONNECTED",
  deletedAt: null,
  createdAt: new Date("2026-01-01"),
};

const shopify = {
  id: "shop_1",
  organisationId: "org_1",
  name: "Shopify",
  platform: "SHOPIFY",
  status: "CONNECTED",
  deletedAt: null,
  createdAt: new Date("2026-01-02"),
};

function dbWithConnections(connections: unknown[], existingId?: string) {
  const creates: unknown[] = [];
  const tx = {
    migration: {
      findFirst: vi.fn(async () =>
        existingId ? { id: existingId } : null,
      ),
      create: vi.fn(async (input) => {
        creates.push(input);
        return { id: "migration_1" };
      }),
    },
  };

  return {
    creates,
    tx,
    db: {
      storeConnection: {
        findMany: vi.fn(async () => connections),
      },
      migration: {},
      $transaction: vi.fn(async (callback) => callback(tx)),
    },
  };
}

describe("create migration workflow", () => {
  it("allows only draft audits or retries of failed Step 2 audits", () => {
    expect(canStartSourceAudit("DRAFT", 1)).toBe(true);
    expect(canStartSourceAudit("FAILED", 2)).toBe(true);
    expect(canStartSourceAudit("FAILED", 6)).toBe(false);
    expect(canStartSourceAudit("READY", 3)).toBe(false);
  });

  it("rejects unauthenticated users", async () => {
    const result = await createMigrationForMember({
      membership: null,
      body: {},
      db: dbWithConnections([]).db as never,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      message: "Authentication required.",
    });
  });

  it("does not allow another organisation's store connection", async () => {
    const { db, tx } = dbWithConnections([woo, shopify]);

    const result = await createMigrationForMember({
      membership,
      body: {
        sourceConnectionId: "other_org_woo",
        targetConnectionId: "shop_1",
      },
      db: db as never,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      redirectTo: "/stores",
    });
    expect(tx.migration.create).not.toHaveBeenCalled();
  });

  it("requires a connected WooCommerce source store", async () => {
    const result = await createMigrationForMember({
      membership,
      body: {},
      db: dbWithConnections([shopify]).db as never,
    });

    expect(result).toMatchObject({
      ok: false,
      message: "Connect a WooCommerce source store before creating a migration.",
      missing: ["source"],
      redirectTo: "/stores",
    });
  });

  it("requires a connected Shopify destination store", async () => {
    const result = await createMigrationForMember({
      membership,
      body: {},
      db: dbWithConnections([woo]).db as never,
    });

    expect(result).toMatchObject({
      ok: false,
      message: "Connect a Shopify destination store before creating a migration.",
      missing: ["destination"],
      redirectTo: "/stores",
    });
  });

  it("creates exactly one migration for a valid source and destination pair", async () => {
    const { db, tx } = dbWithConnections([woo, shopify]);

    const result = await createMigrationForMember({
      membership,
      body: {
        name: "Launch migration",
        sourceConnectionId: "woo_1",
        targetConnectionId: "shop_1",
      },
      db: db as never,
    });

    expect(result).toEqual({
      ok: true,
      migrationId: "migration_1",
      reusedExisting: false,
      redirectTo: "/migrations/migration_1/setup",
    });
    expect(tx.migration.create).toHaveBeenCalledTimes(1);
  });

  it("creates default configuration and supported modules", async () => {
    const { db, creates } = dbWithConnections([woo, shopify]);

    await createMigrationForMember({
      membership,
      body: {},
      db: db as never,
    });

    const createInput = creates[0] as {
      data: {
        status: string;
        currentStep: number;
        duplicateStrategy: string;
        configuration: { create: { modules: Record<string, boolean> } };
        modules: { create: Array<{ entityType: string }> };
      };
    };
    expect(createInput.data.status).toBe("DRAFT");
    expect(createInput.data.currentStep).toBe(1);
    expect(createInput.data.duplicateStrategy).toBe("SKIP_EXISTING");
    expect(Object.keys(createInput.data.configuration.create.modules)).toEqual(
      [...supportedMigrationModules],
    );
    expect(createInput.data.modules.create.map((module) => module.entityType)).toEqual(
      [...supportedMigrationModules],
    );
  });

  it("reuses an existing draft on repeated double-click", async () => {
    const { db, tx } = dbWithConnections([woo, shopify], "migration_existing");

    const result = await createMigrationForMember({
      membership,
      body: {
        sourceConnectionId: "woo_1",
        targetConnectionId: "shop_1",
      },
      db: db as never,
    });

    expect(result).toMatchObject({
      ok: true,
      migrationId: "migration_existing",
      reusedExisting: true,
      redirectTo: "/migrations/migration_existing/setup",
    });
    expect(tx.migration.create).not.toHaveBeenCalled();
  });

  it("button flow redirects to stores when connections are missing", () => {
    expect(migrationCreateAvailability([])).toEqual({
      canCreate: false,
      missing: ["source", "destination"],
      message:
        "Connect a WooCommerce source store and a Shopify destination store before creating a migration.",
    });
  });

  it("created migration opens the scoped wizard route", async () => {
    const result = await createMigrationForMember({
      membership,
      body: {},
      db: dbWithConnections([woo, shopify]).db as never,
    });

    expect(result.ok && result.redirectTo).toBe("/migrations/migration_1/setup");
  });

  it("wizard clearly shows worker offline before audit starts", async () => {
    const source = await readFile(
      new URL("../app/migrations/[migrationId]/setup/page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      "Worker offline. Start the migration worker before audit starts.",
    );
  });
});
