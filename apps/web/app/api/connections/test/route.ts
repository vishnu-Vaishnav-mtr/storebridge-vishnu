import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@storebridge/database";
import {
  encryptSecret,
  maskSecret,
  redactSecrets,
  shopifyTokenConnectionSchema,
  wooConnectionSchema,
} from "@storebridge/shared";
import { ShopifyAdapter } from "@storebridge/shopify-adapter";
import { WooCommerceAdapter } from "@storebridge/woo-adapter";
import { canManageConnections, getCurrentMembership } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!canManageConnections(membership.role)) {
    return NextResponse.json(
      { ok: false, error: "Insufficient permissions." },
      { status: 403 },
    );
  }
  const limited = rateLimit({
    key: `connection-test:${membership.organisationId}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many connection attempts." },
      { status: 429 },
    );
  }

  const body = await request.json();
  const persist = body.persist === true;
  const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;

  try {
    if (body.type === "woocommerce") {
      const input = wooConnectionSchema.parse({
        name: body.name,
        storeUrl: body.storeUrl,
        consumerKey: body.consumerKey,
        consumerSecret: body.consumerSecret,
        apiVersion: body.apiVersion || "wc/v3",
        verifySsl: body.verifySsl ?? true,
        requestTimeoutMs: Number(body.requestTimeoutMs || 30000),
        wordpressUsername: body.wordpressUsername || undefined,
        wordpressApplicationPassword:
          body.wordpressApplicationPassword || undefined,
        wordpressBaseUrl: body.wordpressBaseUrl || undefined,
      });

      const result = await new WooCommerceAdapter({
              storeUrl: input.storeUrl,
              consumerKey: input.consumerKey,
              consumerSecret: input.consumerSecret,
              apiVersion: input.apiVersion,
              verifySsl: input.verifySsl,
              timeoutMs: input.requestTimeoutMs,
              allowPrivateNetwork:
                process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
            }).testConnection();

      if (persist) {
        if (!encryptionKey)
          throw new Error(
            "CREDENTIAL_ENCRYPTION_KEY is required to save credentials.",
          );
        await saveConnection({
          organisationId: membership.organisationId,
          platform: "WOOCOMMERCE",
          name: input.name,
          url: input.storeUrl,
          apiVersion: input.apiVersion,
          status: result.status,
          metadata: result.metadata,
          secrets: {
            consumerKey: input.consumerKey,
            consumerSecret: input.consumerSecret,
            wordpressUsername: input.wordpressUsername,
            wordpressApplicationPassword: input.wordpressApplicationPassword,
          },
          connectionMetadata: {
            wordpressBaseUrl: input.wordpressBaseUrl,
          },
          encryptionKey,
        });
      }

      return NextResponse.json(redactSecrets(result));
    }

    if (body.type === "shopify") {
      const input = shopifyTokenConnectionSchema.parse({
        name: body.name,
        shopDomain: body.shopDomain,
        clientId: body.clientId || undefined,
        clientSecret: body.clientSecret || undefined,
        adminAccessToken: body.adminAccessToken || undefined,
        apiVersion:
          body.apiVersion || process.env.SHOPIFY_API_VERSION || "2026-01",
      });

      const result = await new ShopifyAdapter(input).testConnection();

      if (persist) {
        if (!encryptionKey)
          throw new Error(
            "CREDENTIAL_ENCRYPTION_KEY is required to save credentials.",
          );
        await saveConnection({
          organisationId: membership.organisationId,
          platform: "SHOPIFY",
          name: input.name,
          url: `https://${input.shopDomain}`,
          apiVersion: input.apiVersion,
          status: result.status,
          metadata: result.metadata,
          secrets: {
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            adminAccessToken: input.adminAccessToken,
          },
          encryptionKey,
        });
      }

      return NextResponse.json(redactSecrets(result));
    }

    return NextResponse.json(
      {
        ok: false,
        status: "CONNECTION_FAILED",
        error: "Unsupported connection type.",
        metadata: {},
        warnings: [],
        missingPermissions: [],
        responseTimeMs: 0,
      },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "CONNECTION_FAILED",
        metadata: {},
        warnings: [],
        missingPermissions: [],
        responseTimeMs: 0,
        error: redactSecrets(
          error instanceof Error ? error.message : "Connection failed.",
        ),
      },
      { status: 400 },
    );
  }
}

async function saveConnection(input: {
  organisationId: string;
  platform: "WOOCOMMERCE" | "SHOPIFY";
  name: string;
  url: string;
  apiVersion?: string;
  status: string;
  metadata: Record<string, unknown>;
  connectionMetadata?: Record<string, unknown>;
  secrets: Record<string, string | undefined>;
  encryptionKey: string;
}) {
  const connection = await prisma.storeConnection.create({
    data: {
      organisationId: input.organisationId,
      name: input.name,
      platform: input.platform,
      status: input.status as never,
      url: input.url,
      apiVersion: input.apiVersion ?? null,
      metadata: {
        ...input.metadata,
        ...input.connectionMetadata,
      } as Prisma.InputJsonObject,
      lastCheckedAt: new Date(),
    },
  });

  for (const [name, value] of Object.entries(input.secrets)) {
    if (!value) continue;
    const encrypted = encryptSecret(value, input.encryptionKey);
    await prisma.encryptedCredential.create({
      data: {
        storeConnectionId: connection.id,
        name,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        algorithm: encrypted.algorithm,
        maskedValue: maskSecret(value),
      },
    });
  }
}
