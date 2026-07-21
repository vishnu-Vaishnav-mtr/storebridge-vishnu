import type {
  AdapterConnectionResult,
  AuditEntityResult,
  NormalizedAddress,
  NormalizedCollection,
  NormalizedCustomer,
  NormalizedInventoryItem,
  NormalizedOrder,
  NormalizedProduct,
  NormalizedVariant,
  NormalizedImage,
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
    const results = [
      await auditGenerator("COLLECTION", this.productCategories(), (record) =>
        Boolean(record.sourceId && record.title),
      ),
      await auditGenerator("PRODUCT", this.products(), (record) =>
        Boolean(record.sourceId && record.title),
      ),
      await auditGenerator("VARIANT", this.productVariations(), (record) =>
        Boolean(record.sourceId && record.productSourceId && record.title),
      ),
      await auditGenerator("MEDIA", this.productImages(), (record) =>
        Boolean(record.sourceId && record.productSourceId && record.url),
      ),
      await auditGenerator("INVENTORY", this.inventory(), (record) =>
        Boolean(record.sourceId && Number.isFinite(record.quantity)),
      ),
      await auditGenerator("CUSTOMER", this.customers(), (record) =>
        Boolean(record.sourceId && (record.email || record.phone)),
      ),
      await auditGenerator(
        "CUSTOMER_ADDRESS",
        this.customerAddresses(),
        (record) => Boolean(record.sourceId && record.customerSourceId),
      ),
      await auditGenerator("ORDER", this.orders(), (record) =>
        Boolean(record.sourceId && record.name && record.lineItems.length > 0),
      ),
    ];
    const [coupons, reviews] = await Promise.all([
      this.count("coupons"),
      this.count("products/reviews"),
    ]);
    results.push(
      entity("COUPON", coupons, coupons),
      entity("REVIEW", reviews, reviews),
    );
    return results;
  }

  async *products(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedProduct;
    raw: unknown;
    hash: string;
  }> {
    for await (const product of this.rawPaginated("products", pageSize)) {
        const normalized = normalizeWooProduct(product);
        yield { normalized, raw: product, hash: stableHash(product) };
    }
  }

  async *productVariations(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedVariant;
    raw: unknown;
    hash: string;
  }> {
    for await (const product of this.rawPaginated("products", pageSize)) {
      const productId = String(product.id);
      for await (const variation of this.rawPaginated(
        `products/${productId}/variations`,
        pageSize,
      )) {
        const normalized = normalizeWooVariation(variation, productId);
        yield { normalized, raw: variation, hash: stableHash(variation) };
      }
    }
  }

  async *productCategories(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedCollection;
    raw: unknown;
    hash: string;
  }> {
    for await (const category of this.rawPaginated(
      "products/categories",
      pageSize,
    )) {
      const normalized = normalizeWooCategory(category);
      yield { normalized, raw: category, hash: stableHash(category) };
    }
  }

  async *productImages(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedImage & { productSourceId: string };
    raw: unknown;
    hash: string;
  }> {
    const seenSourceIds = new Set<string>();
    for await (const product of this.rawPaginated("products", pageSize)) {
      const productSourceId = String(product.id);
      const images = Array.isArray(product.images) ? product.images : [];
      for (const image of images) {
        const normalized = normalizeWooImage(image, productSourceId);
        const originalSourceId = normalized.sourceId;
        if (seenSourceIds.has(originalSourceId)) {
          // A WordPress media item can be attached to multiple Woo products.
          // Shopify product media is product-scoped, so repeated references
          // need their own stable association ID instead of being discarded.
          normalized.sourceId = `${originalSourceId}:${productSourceId}`;
        }
        seenSourceIds.add(originalSourceId);
        yield { normalized, raw: image, hash: stableHash(image) };
      }
    }
  }

  async *inventory(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedInventoryItem;
    raw: unknown;
    hash: string;
  }> {
    for await (const product of this.rawPaginated("products", pageSize)) {
      const normalized = normalizeWooInventory(product);
      if (normalized) yield { normalized, raw: product, hash: stableHash(product) };

      const productId = String(product.id);
      for await (const variation of this.rawPaginated(
        `products/${productId}/variations`,
        pageSize,
      )) {
        const variationInventory = normalizeWooInventory(variation, productId);
        if (variationInventory) {
          yield {
            normalized: variationInventory,
            raw: variation,
            hash: stableHash(variation),
          };
        }
      }
    }
  }

  async *customers(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedCustomer;
    raw: unknown;
    hash: string;
  }> {
    for await (const customer of this.rawPaginated("customers", pageSize)) {
      const normalized = normalizeWooCustomer(customer);
      yield { normalized, raw: customer, hash: stableHash(customer) };
    }
  }

  async *customerAddresses(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedAddress & { customerSourceId: string };
    raw: unknown;
    hash: string;
  }> {
    for await (const customer of this.rawPaginated("customers", pageSize)) {
      const customerSourceId = String(customer.id);
      const normalized = normalizeWooCustomer(customer);
      for (const address of normalized.addresses) {
        yield {
          normalized: { ...address, customerSourceId },
          raw: address,
          hash: stableHash(address),
        };
      }
    }
  }

  async *orders(pageSize = 50): AsyncGenerator<{
    normalized: NormalizedOrder;
    raw: unknown;
    hash: string;
  }> {
    for await (const order of this.rawPaginated("orders", pageSize)) {
      const normalized = normalizeWooOrder(order);
      yield { normalized, raw: order, hash: stableHash(order) };
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

  private async *rawPaginated(
    endpoint: string,
    pageSize: number,
  ): AsyncGenerator<Record<string, unknown>> {
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const response = await this.rawRequest(endpoint, {
        page: String(page),
        per_page: String(pageSize),
      });
      if (!response.ok)
        throw new Error(`WooCommerce returned ${response.status}.`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      totalPages = Math.max(
        1,
        Number(response.headers.get("x-wp-totalpages") ?? totalPages),
      );
      for (const row of rows) yield row;
      page += 1;
    }
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
    collectionSourceIds: categories
      .map((category) => String((category as { id?: unknown }).id ?? ""))
      .filter(Boolean),
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
  const seo = normalizeSeo(product);
  if (seo.title || seo.description) normalized.seo = seo;

  return normalized;
}

function normalizeWooVariation(
  variation: Record<string, unknown>,
  productSourceId: string,
): NormalizedVariant {
  const attributes = Array.isArray(variation.attributes)
    ? variation.attributes
    : [];
  const normalized: NormalizedVariant = {
    sourceId: String(variation.id),
    productSourceId,
    title: String(variation.name ?? variation.sku ?? variation.id),
    optionValues: attributes
      .map((attribute) => ({
        optionName: String((attribute as { name?: unknown }).name ?? ""),
        name: String((attribute as { option?: unknown }).option ?? ""),
      }))
      .filter((value) => value.optionName && value.name),
    metafields: [],
  };
  if (typeof variation.sku === "string") normalized.sku = variation.sku;
  if (typeof variation.price === "string") normalized.price = variation.price;
  if (typeof variation.regular_price === "string")
    normalized.compareAtPrice = variation.regular_price;
  if (typeof variation.stock_quantity === "number")
    normalized.inventoryQuantity = variation.stock_quantity;
  return normalized;
}

function normalizeWooCategory(
  category: Record<string, unknown>,
): NormalizedCollection {
  const normalized: NormalizedCollection = {
    sourceId: String(category.id),
    title: String(category.name ?? "Untitled collection"),
  };
  if (typeof category.slug === "string") normalized.handle = category.slug;
  if (typeof category.description === "string")
    normalized.descriptionHtml = category.description;
  const seo = normalizeSeo(category);
  if (seo.title || seo.description) normalized.seo = seo;
  return normalized;
}

function normalizeWooImage(
  image: unknown,
  productSourceId: string,
): NormalizedImage & { productSourceId: string } {
  const row = image as { id?: unknown; src?: unknown; alt?: unknown };
  return {
    sourceId: String(row.id ?? row.src),
    productSourceId,
    url: String(row.src ?? ""),
    altText: String(row.alt ?? ""),
  };
}

function normalizeWooInventory(
  row: Record<string, unknown>,
  parentProductSourceId?: string,
): NormalizedInventoryItem | null {
  if (row.manage_stock !== true && typeof row.stock_quantity !== "number")
    return null;
  const sourceId = String(row.id);
  const normalized: NormalizedInventoryItem = {
    sourceId,
    quantity: Number(row.stock_quantity ?? 0),
  };
  if (typeof row.sku === "string") normalized.sku = row.sku;
  if (parentProductSourceId) {
    normalized.productSourceId = parentProductSourceId;
    normalized.variantSourceId = sourceId;
  } else {
    normalized.productSourceId = sourceId;
  }
  return normalized;
}

function normalizeWooCustomer(customer: Record<string, unknown>): NormalizedCustomer {
  const normalized: NormalizedCustomer = {
    sourceId: String(customer.id),
    addresses: [],
    metafields: [],
  };
  if (typeof customer.email === "string") normalized.email = customer.email;
  if (typeof customer.first_name === "string")
    normalized.firstName = customer.first_name;
  if (typeof customer.last_name === "string")
    normalized.lastName = customer.last_name;
  const billing = normalizeWooAddress(customer.billing, `${customer.id}:billing`);
  const shipping = normalizeWooAddress(customer.shipping, `${customer.id}:shipping`);
  if (billing) normalized.addresses.push(billing);
  if (shipping) normalized.addresses.push(shipping);
  if (billing?.phone) normalized.phone = billing.phone;
  return normalized;
}

async function auditGenerator<T>(
  entityType: string,
  records: AsyncIterable<{ normalized: T }>,
  supported: (record: T) => boolean,
): Promise<AuditEntityResult> {
  let detectedCount = 0;
  let supportedCount = 0;
  for await (const record of records) {
    detectedCount += 1;
    if (supported(record.normalized)) supportedCount += 1;
  }
  const unsupportedCount = detectedCount - supportedCount;
  return {
    entityType,
    detectedCount,
    supportedCount,
    needsMapping: 0,
    warningCount: unsupportedCount,
    unsupportedCount,
    warnings:
      unsupportedCount > 0
        ? [`${unsupportedCount} records failed source validation.`]
        : [],
  };
}

export function normalizeWooOrder(order: Record<string, unknown>): NormalizedOrder {
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const normalized: NormalizedOrder = {
    sourceId: String(order.id),
    name: String(order.number ?? order.id),
    lineItems: lineItems.map((lineItem) => {
      const item = lineItem as Record<string, unknown>;
      const output: {
        title: string;
        quantity: number;
        sku?: string;
        price?: string;
        productSourceId?: string;
        variantSourceId?: string;
      } = {
        title: String(item.name ?? item.sku ?? "Line item"),
        quantity: Number(item.quantity ?? 1),
      };
      if (typeof item.sku === "string") output.sku = item.sku;
      if (typeof item.price === "string" && item.price.trim()) {
        output.price = item.price;
      } else if (typeof item.price === "number" && Number.isFinite(item.price)) {
        output.price = String(item.price);
      } else if (
        (typeof item.total === "string" || typeof item.total === "number") &&
        Number.isFinite(Number(item.total)) &&
        output.quantity > 0
      ) {
        // Woo exposes the actual discounted line total even when a plugin
        // omits the unit price. Derive the real unit value instead of using a
        // placeholder price.
        output.price = String(Number(item.total) / output.quantity);
      }
      if (item.product_id != null) output.productSourceId = String(item.product_id);
      if (item.variation_id != null && Number(item.variation_id) > 0)
        output.variantSourceId = String(item.variation_id);
      return output;
    }),
    metafields: [
      {
        namespace: "storebridge",
        key: "source_order_status",
        type: "single_line_text_field",
        value: String(order.status ?? ""),
      },
    ],
  };
  if (typeof order.billing === "object") {
    const billingAddress = normalizeWooAddress(
      order.billing,
      `${order.id}:billing`,
    );
    if (billingAddress) normalized.billingAddress = billingAddress;
  }
  if (typeof order.shipping === "object") {
    const shippingAddress = normalizeWooAddress(
      order.shipping,
      `${order.id}:shipping`,
    );
    if (shippingAddress) normalized.shippingAddress = shippingAddress;
  }
  if (typeof order.email === "string") normalized.email = order.email;
  if (typeof order.date_created_gmt === "string")
    normalized.processedAt = `${order.date_created_gmt}Z`;
  if (typeof order.currency === "string") normalized.currencyCode = order.currency;
  if (typeof order.total === "string") normalized.totalPrice = order.total;
  if (order.customer_id != null && Number(order.customer_id) > 0)
    normalized.customerSourceId = String(order.customer_id);
  return normalized;
}

function normalizeWooAddress(
  value: unknown,
  sourceId: string,
): NormalizedAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const address = value as Record<string, unknown>;
  const normalized: NormalizedAddress = { sourceId };
  if (typeof address.first_name === "string")
    normalized.firstName = address.first_name;
  if (typeof address.last_name === "string") normalized.lastName = address.last_name;
  if (typeof address.company === "string") normalized.company = address.company;
  if (typeof address.address_1 === "string") normalized.address1 = address.address_1;
  if (typeof address.address_2 === "string") normalized.address2 = address.address_2;
  if (typeof address.city === "string") normalized.city = address.city;
  if (typeof address.state === "string") normalized.province = address.state;
  if (typeof address.country === "string") normalized.country = address.country;
  if (typeof address.postcode === "string") normalized.zip = address.postcode;
  if (typeof address.phone === "string") normalized.phone = address.phone;
  if (!normalized.address1 && !normalized.city && !normalized.country) return undefined;
  return normalized;
}

function normalizeSeo(row: Record<string, unknown>) {
  const meta = row.yoast_head_json as Record<string, unknown> | undefined;
  const seo: { title?: string; description?: string } = {};
  if (typeof meta?.title === "string") seo.title = meta.title;
  if (typeof meta?.description === "string") seo.description = meta.description;
  return seo;
}
