import type { AuditEntityResult, NormalizedProduct } from "@storebridge/shared";

export const demoAuditResults: AuditEntityResult[] = [
  {
    entityType: "PRODUCT",
    detectedCount: 20,
    supportedCount: 18,
    needsMapping: 1,
    warningCount: 1,
    unsupportedCount: 1,
    warnings: ["One duplicate SKU detected."],
  },
  {
    entityType: "CUSTOMER",
    detectedCount: 12,
    supportedCount: 11,
    needsMapping: 0,
    warningCount: 1,
    unsupportedCount: 0,
    warnings: ["One customer email is invalid."],
  },
  {
    entityType: "ORDER",
    detectedCount: 10,
    supportedCount: 10,
    needsMapping: 1,
    warningCount: 1,
    unsupportedCount: 0,
    warnings: ["One order references a missing product."],
  },
  {
    entityType: "MEDIA",
    detectedCount: 20,
    supportedCount: 19,
    needsMapping: 0,
    warningCount: 1,
    unsupportedCount: 0,
    warnings: ["One image URL returned an error."],
  },
];

export const demoProducts: NormalizedProduct[] = Array.from(
  { length: 20 },
  (_, index) => ({
    sourceId: `demo-product-${index + 1}`,
    title: `Demo Product ${index + 1}`,
    handle: `demo-product-${index + 1}`,
    descriptionHtml:
      "<p>Demo product created for StoreBridge local development.</p>",
    status: "ACTIVE",
    tags: ["Demo", index === 1 ? "Duplicate SKU" : "Migration"],
    sku: index === 1 ? "DUPLICATE-SKU" : `SKU-${index + 1}`,
    price: "29.00",
    images: [
      {
        sourceId: `demo-image-${index + 1}`,
        url:
          index === 2
            ? "https://demo.storebridge.local/missing.jpg"
            : "https://demo.storebridge.local/product.jpg",
        altText: `Demo Product ${index + 1}`,
      },
    ],
    options: [{ name: "Size", values: ["S", "M", "L"] }],
    metafields: [],
  }),
);
