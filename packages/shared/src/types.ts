export interface NormalizedImage {
  sourceId: string;
  url: string;
  altText?: string;
  hash?: string;
}

export interface NormalizedProduct {
  sourceId: string;
  title: string;
  handle?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
  collectionSourceIds: string[];
  sku?: string;
  price?: string;
  compareAtPrice?: string;
  seo?: NormalizedSeoFields;
  images: NormalizedImage[];
  options: Array<{ name: string; values: string[] }>;
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}

export interface NormalizedVariant {
  sourceId: string;
  productSourceId: string;
  title: string;
  sku?: string;
  price?: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  optionValues: Array<{ optionName: string; name: string }>;
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}

export interface NormalizedCollection {
  sourceId: string;
  title: string;
  handle?: string;
  descriptionHtml?: string;
  seo?: NormalizedSeoFields;
}

export interface NormalizedInventoryItem {
  sourceId: string;
  productSourceId?: string;
  variantSourceId?: string;
  sku?: string;
  quantity: number;
  locationName?: string;
}

export interface NormalizedAddress {
  sourceId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  phone?: string;
}

export interface NormalizedCustomer {
  sourceId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  acceptsMarketing?: boolean;
  addresses: NormalizedAddress[];
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}

export interface NormalizedOrderLineItem {
  title: string;
  quantity: number;
  sku?: string;
  price?: string;
  productSourceId?: string;
  variantSourceId?: string;
}

export interface NormalizedOrder {
  sourceId: string;
  name: string;
  email?: string;
  processedAt?: string;
  currencyCode?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  totalPrice?: string;
  customerSourceId?: string;
  billingAddress?: NormalizedAddress;
  shippingAddress?: NormalizedAddress;
  lineItems: NormalizedOrderLineItem[];
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}

export interface NormalizedContent {
  sourceId: string;
  title: string;
  handle?: string;
  bodyHtml?: string;
  author?: string;
  publishedAt?: string;
  status: "PUBLISHED" | "DRAFT";
  seo?: NormalizedSeoFields;
}

export interface NormalizedSeoFields {
  title?: string;
  description?: string;
}

export interface NormalizedRedirect {
  sourceId: string;
  path: string;
  target: string;
}

export interface AdapterConnectionResult {
  ok: boolean;
  status:
    | "CONNECTED"
    | "CONNECTED_WITH_WARNINGS"
    | "PERMISSION_MISSING"
    | "CONNECTION_FAILED";
  storeName?: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  missingPermissions: string[];
  responseTimeMs: number;
  error?: string;
}

export interface AuditEntityResult {
  entityType: string;
  detectedCount: number;
  supportedCount: number;
  needsMapping: number;
  warningCount: number;
  unsupportedCount: number;
  warnings: string[];
}
