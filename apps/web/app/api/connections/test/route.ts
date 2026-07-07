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

export async function POST(request: Request) {
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

      const result =
        input.storeUrl.includes("demo-woocommerce.storebridge.local") ||
        body.demo === true
          ? demoResult("Demo Woo Store")
          : await new WooCommerceAdapter({
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
          platform: "WOOCOMMERCE",
          name: input.name,
          url: input.storeUrl,
          apiVersion: input.apiVersion,
          status: result.status,
          metadata: result.metadata,
          secrets: {
            consumerKey: input.consumerKey,
            consumerSecret: input.consumerSecret,
            wordpressApplicationPassword: input.wordpressApplicationPassword,
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
        adminAccessToken: body.adminAccessToken,
        apiVersion:
          body.apiVersion || process.env.SHOPIFY_API_VERSION || "2026-01",
      });

      const result =
        input.shopDomain.includes("demo-store.myshopify.com") ||
        body.demo === true
          ? demoResult("Demo Shopify")
          : await new ShopifyAdapter(input).testConnection();

      if (persist) {
        if (!encryptionKey)
          throw new Error(
            "CREDENTIAL_ENCRYPTION_KEY is required to save credentials.",
          );
        await saveConnection({
          platform: "SHOPIFY",
          name: input.name,
          url: `https://${input.shopDomain}`,
          apiVersion: input.apiVersion,
          status: result.status,
          metadata: result.metadata,
          secrets: { adminAccessToken: input.adminAccessToken },
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
  platform: "WOOCOMMERCE" | "SHOPIFY";
  name: string;
  url: string;
  apiVersion?: string;
  status: string;
  metadata: Record<string, unknown>;
  secrets: Record<string, string | undefined>;
  encryptionKey: string;
}) {
  const organisation =
    (await prisma.organisation.findFirst()) ??
    (await prisma.organisation.create({
      data: { name: "Default Workspace", slug: "default-workspace" },
    }));

  const connection = await prisma.storeConnection.create({
    data: {
      organisationId: organisation.id,
      name: input.name,
      platform: input.platform,
      status: input.status as never,
      url: input.url,
      apiVersion: input.apiVersion ?? null,
      metadata: input.metadata as Prisma.InputJsonObject,
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

function demoResult(storeName: string) {
  return {
    ok: true,
    status: "CONNECTED",
    storeName,
    metadata: {
      storeName,
      currency: "USD",
      timezone: "America/New_York",
      grantedScopes: [
        "write_products",
        "write_customers",
        "write_orders",
        "write_content",
        "write_files",
      ],
      missingScopes: [],
    },
    warnings: [],
    missingPermissions: [],
    responseTimeMs: 24,
  };
}
