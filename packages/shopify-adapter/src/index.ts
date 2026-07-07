import type {
  AdapterConnectionResult,
  NormalizedProduct,
} from "@storebridge/shared";

export interface ShopifyConnectionOptions {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion?: string;
}

export class ShopifyAdapter {
  constructor(private readonly options: ShopifyConnectionOptions) {}

  async testConnection(): Promise<AdapterConnectionResult> {
    const started = performance.now();
    try {
      const data = await this.graphql<{
        shop: {
          name: string;
          myshopifyDomain: string;
          currencyCode: string;
          timezoneAbbreviation: string;
          plan: { displayName: string };
        };
        appInstallation: { accessScopes: Array<{ handle: string }> };
      }>(`query StoreBridgeConnectionTest {
        shop {
          name
          myshopifyDomain
          currencyCode
          timezoneAbbreviation
          plan { displayName }
        }
        appInstallation {
          accessScopes { handle }
        }
      }`);

      const grantedScopes = data.appInstallation.accessScopes.map(
        (scope) => scope.handle,
      );
      const requiredScopes = [
        "write_products",
        "write_customers",
        "write_orders",
        "write_content",
        "write_files",
      ];
      const missingPermissions = requiredScopes.filter(
        (scope) => !grantedScopes.includes(scope),
      );

      return {
        ok: missingPermissions.length === 0,
        status: missingPermissions.length ? "PERMISSION_MISSING" : "CONNECTED",
        storeName: data.shop.name,
        metadata: {
          shopDomain: data.shop.myshopifyDomain,
          primaryCurrency: data.shop.currencyCode,
          timezone: data.shop.timezoneAbbreviation,
          plan: data.shop.plan.displayName,
          grantedScopes,
          missingScopes: missingPermissions,
        },
        warnings: missingPermissions.length
          ? ["Some Shopify scopes are missing."]
          : [],
        missingPermissions,
        responseTimeMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return {
        ok: false,
        status: "CONNECTION_FAILED",
        metadata: { shopDomain: this.options.shopDomain },
        warnings: [],
        missingPermissions: [],
        responseTimeMs: Math.round(performance.now() - started),
        error:
          error instanceof Error ? error.message : "Shopify connection failed.",
      };
    }
  }

  async upsertProduct(
    product: NormalizedProduct,
    sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findProductBySourceId(sourceId);
    if (existing) return { gid: existing, duplicatePrevented: true };

    const response = await this.graphql<{
      productCreate: {
        product: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeProductCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id }
          userErrors { message }
        }
      }`,
      {
        product: {
          title: product.title,
          handle: product.handle,
          descriptionHtml: product.descriptionHtml,
          vendor: product.vendor,
          productType: product.productType,
          tags: product.tags,
          status: product.status,
          metafields: [
            ...product.metafields,
            {
              namespace: "storebridge",
              key: "source_product_id",
              type: "single_line_text_field",
              value: sourceId,
            },
          ],
        },
      },
    );

    const error = response.productCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.productCreate.product?.id;
    if (!gid) throw new Error("Shopify did not return a product ID.");
    return { gid, duplicatePrevented: false };
  }

  private async findProductBySourceId(
    sourceId: string,
  ): Promise<string | null> {
    const query = `metafield:storebridge.source_product_id:${sourceId}`;
    const response = await this.graphql<{
      products: { nodes: Array<{ id: string }> };
    }>(
      `query StoreBridgeProductBySourceId($query: String!) {
        products(first: 1, query: $query) { nodes { id } }
      }`,
      { query },
    );
    return response.products.nodes[0]?.id ?? null;
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const apiVersion = this.options.apiVersion ?? "2026-01";
    const response = await fetch(
      `https://${this.options.shopDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-access-token": this.options.adminAccessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    if (!response.ok) throw new Error(`Shopify returned ${response.status}.`);
    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length)
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    if (!payload.data) throw new Error("Shopify returned no data.");
    return payload.data;
  }
}
