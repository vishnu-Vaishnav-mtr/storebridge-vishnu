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
  sku?: string;
  price?: string;
  compareAtPrice?: string;
  images: NormalizedImage[];
  options: Array<{ name: string; values: string[] }>;
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
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
