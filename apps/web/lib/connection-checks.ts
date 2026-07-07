import type { Prisma } from "@storebridge/database";
import { prisma } from "@storebridge/database";
import { ShopifyAdapter } from "@storebridge/shopify-adapter";
import { decryptSecret } from "@storebridge/shared";
import { WooCommerceAdapter } from "@storebridge/woo-adapter";

type ConnectionWithCredentials = Prisma.StoreConnectionGetPayload<{
  include: { credentials: true };
}>;

export async function recheckStoreConnection(
  connectionId: string,
  organisationId: string,
  db = prisma,
) {
  const connection = await db.storeConnection.findFirst({
    where: { id: connectionId, organisationId, deletedAt: null },
    include: { credentials: true },
  });
  if (!connection) throw new Error("Store connection not found.");

  const result =
    connection.platform === "WOOCOMMERCE"
      ? await new WooCommerceAdapter({
          storeUrl: connection.url,
          consumerKey: credential(connection, "consumerKey"),
          consumerSecret: credential(connection, "consumerSecret"),
          apiVersion: connection.apiVersion ?? "wc/v3",
          allowPrivateNetwork:
            process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
        }).testConnection()
      : connection.platform === "SHOPIFY"
        ? await new ShopifyAdapter({
            shopDomain: new URL(connection.url).hostname,
            adminAccessToken: credential(connection, "adminAccessToken"),
            apiVersion: connection.apiVersion ?? "2026-01",
          }).testConnection()
        : {
            ok: false,
            status: "CONNECTION_FAILED" as const,
            metadata: {},
            warnings: [],
            missingPermissions: [],
            responseTimeMs: 0,
            error: "Unsupported store platform.",
          };

  await db.storeConnection.update({
    where: { id: connection.id },
    data: {
      status: result.status,
      health: {
        ok: result.ok,
        warnings: result.warnings,
        missingPermissions: result.missingPermissions,
        error: result.error,
        responseTimeMs: result.responseTimeMs,
      } as Prisma.InputJsonObject,
      metadata: result.metadata as Prisma.InputJsonObject,
      lastCheckedAt: new Date(),
    },
  });

  return result;
}

function credential(connection: ConnectionWithCredentials, name: string) {
  const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Credential encryption key is missing.");
  const encrypted = connection.credentials
    .filter((item) => item.name === name && !item.deletedAt)
    .sort((a, b) => b.version - a.version)[0];
  if (!encrypted) throw new Error(`Missing credential ${name}.`);
  return decryptSecret(
    {
      algorithm: "aes-256-gcm",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
    encryptionKey,
  );
}
