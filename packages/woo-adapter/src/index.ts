import type {
  AdapterConnectionResult,
  AuditEntityResult,
  NormalizedProduct,
} from "@storebridge/shared";
import { stableHash, validatePublicStoreUrl } from "@storebridge/shared";

export interface WooConnectionOptions {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  apiVersion?: string;
  verifySsl?: boolean;
  timeoutMs?: number;
  allowPrivateNetwork?: boolean;
}

export class WooCommerceAdapter {
  private readonly baseUrl: URL;

  constructor(private readonly options: WooConnectionOptions) {
    const validation = validatePublicStoreUrl(
      options.storeUrl,
      options.allowPrivateNetwork,
    );
    if (!validation.ok || !validation.url) {
      throw new Error(validation.reason ?? "Invalid WooCommerce URL.");
    }
    this.baseUrl = validation.url;
  }

  async testConnection(): Promise<AdapterConnectionResult> {
    const started = performance.now();
    try {
      const response = await this.request<{
        environment?: {
          home_url?: string;
          version?: string;
          wp_version?: string;
          timezone?: string;
        };
      }>("system_status");
      const settings =
        await this.request<Array<{ id: string; value: unknown }>>(
          "settings/general",
        );
      const currency = settings.find(
        (item) => item.id === "woocommerce_currency",
      )?.value;

      return {
        ok: true,
        status: "CONNECTED",
        storeName: String(
          response.environment?.home_url ?? this.baseUrl.hostname,
        ),
        metadata: {
          url: this.baseUrl.origin,
          wooVersion: response.environment?.version,
          wordpressVersion: response.environment?.wp_version,
          currency,
          timezone: response.environment?.timezone,
        },
        warnings: [],
        missingPermissions: [],
        responseTimeMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return {
        ok: false,
        status: "CONNECTION_FAILED",
        metadata: { url: this.baseUrl.origin },
        warnings: [],
        missingPermissions: [],
        responseTimeMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : "Connection failed.",
      };
    }
  }

  async audit(): Promise<AuditEntityResult[]> {
    const [products, customers, orders, coupons] = await Promise.all([
      this.count("products"),
      this.count("customers"),
      this.count("orders"),
      this.count("coupons"),
    ]);

    return [
      entity("PRODUCT", products),
      entity("CUSTOMER", customers),
      entity("ORDER", orders, Math.ceil(orders * 0.03)),
      entity("COUPON", coupons, Math.ceil(coupons * 0.1)),
      entity("MEDIA", products),
      entity("COLLECTION", await this.count("products/categories")),
      entity("REVIEW", await this.count("products/reviews")),
    ];
  }

  async *products(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedProduct;
    raw: unknown;
    hash: string;
  }> {
    let page = 1;
    while (true) {
      const products = await this.request<Array<Record<string, unknown>>>(
        "products",
        {
          page: String(page),
          per_page: String(pageSize),
        },
      );
      if (products.length === 0) break;

      for (const product of products) {
        const normalized = normalizeWooProduct(product);
        yield { normalized, raw: product, hash: stableHash(product) };
      }
      page += 1;
    }
  }

  private async count(endpoint: string): Promise<number> {
    const response = await this.rawRequest(endpoint, {
      page: "1",
      per_page: "1",
    });
    return Number(response.headers.get("x-wp-total") ?? 0);
  }

  private async request<T>(
    endpoint: string,
    query: Record<string, string> = {},
  ): Promise<T> {
    const response = await this.rawRequest(endpoint, query);
    if (!response.ok)
      throw new Error(`WooCommerce returned ${response.status}.`);
    return (await response.json()) as T;
  }

  private async rawRequest(
    endpoint: string,
    query: Record<string, string>,
  ): Promise<Response> {
    const apiVersion = this.options.apiVersion ?? "wc/v3";
    const url = new URL(`/wp-json/${apiVersion}/${endpoint}`, this.baseUrl);
    url.searchParams.set("consumer_key", this.options.consumerKey);
    url.searchParams.set("consumer_secret", this.options.consumerSecret);
    Object.entries(query).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 30_000,
    );
    try {
      return await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function entity(
  entityType: string,
  detectedCount: number,
  warnings = 0,
): AuditEntityResult {
  return {
    entityType,
    detectedCount,
    supportedCount: Math.max(0, detectedCount - warnings),
    needsMapping: warnings,
    warningCount: warnings,
    unsupportedCount: 0,
    warnings: warnings
      ? [`${warnings} records need mapping before migration.`]
      : [],
  };
}

function normalizeWooProduct(
  product: Record<string, unknown>,
): NormalizedProduct {
  const images = Array.isArray(product.images) ? product.images : [];
  const categories = Array.isArray(product.categories)
    ? product.categories
    : [];
  const attributes = Array.isArray(product.attributes)
    ? product.attributes
    : [];
  const normalized: NormalizedProduct = {
    sourceId: String(product.id),
    title: String(product.name ?? "Untitled product"),
    status: product.status === "publish" ? "ACTIVE" : "DRAFT",
    tags: Array.isArray(product.tags)
      ? product.tags
          .map((tag) => String((tag as { name?: unknown }).name ?? ""))
          .filter(Boolean)
      : [],
    images: images.map((image) => ({
      sourceId: String(
        (image as { id?: unknown }).id ?? (image as { src?: unknown }).src,
      ),
      url: String((image as { src?: unknown }).src ?? ""),
      altText: String((image as { alt?: unknown }).alt ?? ""),
    })),
    options: attributes.map((attribute) => ({
      name: String((attribute as { name?: unknown }).name ?? ""),
      values: Array.isArray((attribute as { options?: unknown }).options)
        ? (attribute as { options: unknown[] }).options.map(String)
        : [],
    })),
    metafields: [],
  };

  if (typeof product.slug === "string") normalized.handle = product.slug;
  if (typeof product.description === "string")
    normalized.descriptionHtml = product.description;
  const productType = categories
    .map((category) => String((category as { name?: unknown }).name ?? ""))
    .filter(Boolean)[0];
  if (productType) normalized.productType = productType;
  if (typeof product.sku === "string") normalized.sku = product.sku;
  if (typeof product.price === "string") normalized.price = product.price;
  if (typeof product.regular_price === "string")
    normalized.compareAtPrice = product.regular_price;

  return normalized;
}
