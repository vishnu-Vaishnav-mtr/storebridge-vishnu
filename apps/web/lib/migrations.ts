import type { Prisma } from "@storebridge/database";
import { prisma } from "@storebridge/database";
import { z } from "zod";
import type { CurrentMembership } from "./session";

export const createMigrationInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sourceConnectionId: z.string().trim().min(1).optional(),
  targetConnectionId: z.string().trim().min(1).optional(),
});

export type CreateMigrationInput = z.infer<typeof createMigrationInputSchema>;

export const supportedMigrationModules = [
  "COLLECTION",
  "PRODUCT",
  "VARIANT",
  "MEDIA",
  "INVENTORY",
  "CUSTOMER",
  "CUSTOMER_ADDRESS",
  "ORDER",
  "PAGE",
  "POST",
  "REDIRECT",
] as const;

type MigrationDb = Pick<
  typeof prisma,
  "storeConnection" | "migration" | "$transaction"
>;

type SelectableConnection = {
  id: string;
  name: string;
  platform: string;
  status: string;
  deletedAt: Date | null;
};

export type MigrationCreateResult =
  | {
      ok: true;
      migrationId: string;
      reusedExisting: boolean;
      redirectTo: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      missing: Array<"source" | "destination">;
      redirectTo?: string;
    };

export function isUsableConnection(connection: {
  platform: string;
  status: string;
  deletedAt: Date | null;
}) {
  return (
    connection.deletedAt === null &&
    ["CONNECTED", "CONNECTED_WITH_WARNINGS"].includes(connection.status) &&
    ["WOOCOMMERCE", "SHOPIFY"].includes(connection.platform)
  );
}

export function canStartSourceAudit(status: string, currentStep: number) {
  return status === "DRAFT" || (status === "FAILED" && currentStep === 2);
}

export function migrationCreateAvailability(
  connections: Array<{
    platform: string;
    status: string;
    deletedAt: Date | null;
  }>,
) {
  const hasSource = connections.some(
    (connection) =>
      connection.platform === "WOOCOMMERCE" && isUsableConnection(connection),
  );
  const hasDestination = connections.some(
    (connection) =>
      connection.platform === "SHOPIFY" && isUsableConnection(connection),
  );
  const missing: Array<"source" | "destination"> = [];
  if (!hasSource) missing.push("source");
  if (!hasDestination) missing.push("destination");

  return {
    canCreate: missing.length === 0,
    missing,
    message: createMissingConnectionMessage(missing),
  };
}

export async function createMigrationForMember(input: {
  membership: CurrentMembership | null;
  body: unknown;
  db?: MigrationDb;
}): Promise<MigrationCreateResult> {
  if (!input.membership) {
    return {
      ok: false,
      status: 401,
      message: "Authentication required.",
      missing: [],
    };
  }

  const parsed = createMigrationInputSchema.safeParse(input.body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Invalid migration request.",
      missing: [],
    };
  }

  const db = input.db ?? prisma;
  const organisationId = input.membership.organisationId;

  const connections = await db.storeConnection.findMany({
    where: { organisationId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const source = selectConnection({
    connections,
    platform: "WOOCOMMERCE",
    ...(parsed.data.sourceConnectionId
      ? { requestedId: parsed.data.sourceConnectionId }
      : {}),
  });
  const target = selectConnection({
    connections,
    platform: "SHOPIFY",
    ...(parsed.data.targetConnectionId
      ? { requestedId: parsed.data.targetConnectionId }
      : {}),
  });

  const missing: Array<"source" | "destination"> = [];
  if (!source) missing.push("source");
  if (!target) missing.push("destination");
  if (missing.length > 0) {
    return {
      ok: false,
      status: 409,
      message: createMissingConnectionMessage(missing),
      missing,
      redirectTo: "/stores",
    };
  }
  if (!source || !target) {
    return {
      ok: false,
      status: 409,
      message: createMissingConnectionMessage(missing),
      missing,
      redirectTo: "/stores",
    };
  }

  if (!isUsableConnection(source)) {
    return {
      ok: false,
      status: 409,
      message: "The WooCommerce source store is disconnected or missing permissions.",
      missing: ["source"],
      redirectTo: "/stores",
    };
  }

  if (!isUsableConnection(target)) {
    return {
      ok: false,
      status: 409,
      message: "The Shopify destination store is disconnected or missing permissions.",
      missing: ["destination"],
      redirectTo: "/stores",
    };
  }

  const name =
    parsed.data.name ??
    `${source.name} to ${target.name} migration`;

  try {
    const migration = await db.$transaction(async (tx) => {
      const existing = await tx.migration.findFirst({
        where: {
          organisationId,
          sourceConnectionId: source.id,
          targetConnectionId: target.id,
          status: "DRAFT",
        },
        select: { id: true },
      });
      if (existing) return { id: existing.id, reusedExisting: true };

      const created = await tx.migration.create({
        data: {
          name,
          organisationId,
          sourceConnectionId: source.id,
          targetConnectionId: target.id,
          status: "DRAFT",
          currentStep: 1,
          duplicateStrategy: "SKIP_EXISTING",
          configuration: {
            create: {
              modules: defaultModulesConfig() as Prisma.InputJsonObject,
              mappings: {},
              options: { duplicateStrategy: "SKIP_EXISTING" },
            },
          },
          modules: {
            create: supportedMigrationModules.map((entityType) => ({
              entityType,
              enabled: true,
              status: "SELECTED",
            })),
          },
        },
        select: { id: true },
      });
      return { id: created.id, reusedExisting: false };
    });

    return {
      ok: true,
      migrationId: migration.id,
      reusedExisting: migration.reusedExisting,
      redirectTo: `/migrations/${migration.id}/setup`,
    };
  } catch {
    return {
      ok: false,
      status: 500,
      message: "Database failure while creating the migration.",
      missing: [],
    };
  }
}

function selectConnection(input: {
  connections: SelectableConnection[];
  platform: "WOOCOMMERCE" | "SHOPIFY";
  requestedId?: string;
}) {
  if (input.requestedId) {
    const requested = input.connections.find(
      (connection) => connection.id === input.requestedId,
    );
    if (!requested || requested.platform !== input.platform) return null;
    return requested;
  }

  return (
    input.connections.find(
      (connection) =>
        connection.platform === input.platform && isUsableConnection(connection),
    ) ?? null
  );
}

function createMissingConnectionMessage(
  missing: Array<"source" | "destination">,
) {
  if (missing.length === 0) return "";
  if (missing.length === 2) {
    return "Connect a WooCommerce source store and a Shopify destination store before creating a migration.";
  }
  if (missing[0] === "source") {
    return "Connect a WooCommerce source store before creating a migration.";
  }
  return "Connect a Shopify destination store before creating a migration.";
}

function defaultModulesConfig() {
  return Object.fromEntries(
    supportedMigrationModules.map((entityType) => [entityType, true]),
  );
}
