import { readFile } from "node:fs/promises";
import type { NormalizedProduct } from "@storebridge/shared";
import { describe, expect, it, vi } from "vitest";
import { runMigrationPipeline, sourceHash } from "./migration-processor";

type RecordStatus =
  | "NORMALIZED"
  | "DUPLICATE_PREVENTED"
  | "CREATED"
  | "UPDATED"
  | "FAILED";

type StoredRecord = {
  id: string;
  entityType: string;
  sourceId: string;
  status: RecordStatus;
  destinationGid?: string;
  attempts: number;
};

function productRecords(
  rows: Array<{ sourceId: string; title: string }>,
): AsyncGenerator<{
  normalized: NormalizedProduct;
  raw: unknown;
  hash: string;
}> {
  async function* generate() {
    for (const row of rows) {
      const normalized: NormalizedProduct = {
        ...row,
        status: "ACTIVE" as const,
        tags: [],
        collectionSourceIds: [],
        images: [],
        options: [],
        metafields: [],
      };
      yield { normalized, raw: row, hash: sourceHash(row) };
    }
  }
  return generate();
}

function productDefinition(rows: Array<{ sourceId: string; title: string }>) {
  return {
    entityType: "PRODUCT" as const,
    records: () => productRecords(rows),
    sourceId: (record: { sourceId: string }) => record.sourceId,
    displayName: (record: { title: string }) => record.title,
    validate: (record: { sourceId: string; title: string }) =>
      record.sourceId && record.title ? [] : ["invalid product"],
    migrate: (
      record: NormalizedProduct,
      context: {
        shopify: {
          upsertProduct: (
            product: NormalizedProduct,
            sourceId: string,
          ) => Promise<{ gid: string; duplicatePrevented?: boolean }>;
        };
      },
    ) => context.shopify.upsertProduct(record, record.sourceId),
  };
}

function fakeShopify(
  upsertProduct: (
    product: unknown,
    sourceId: string,
  ) => Promise<{ gid: string; duplicatePrevented?: boolean }>,
) {
  return {
    resourceExists: vi.fn(async (gid: string) => gid.startsWith("gid://shopify/")),
    upsertProduct: vi.fn(upsertProduct),
    upsertCollection: vi.fn(),
    upsertProductImage: vi.fn(),
    upsertVariant: vi.fn(),
    inventoryItemGidForVariant: vi.fn(),
    inventoryItemGidForProduct: vi.fn(),
    defaultLocationGid: vi.fn(),
    updateInventory: vi.fn(),
    upsertCustomer: vi.fn(),
    upsertCustomerAddress: vi.fn(),
    createHistoricalOrder: vi.fn(),
    upsertPage: vi.fn(),
    upsertPost: vi.fn(),
    createUrlRedirect: vi.fn(),
  };
}

function fakeStore() {
  const mappings = new Map<string, string>();
  const mappingHashes = new Map<string, string>();
  const records = new Map<string, StoredRecord>();
  const checkpoints = new Map<string, { processed: number; lastSourceId: string | null }>();
  const errors: Array<{
    id: string;
    entityType: string | null;
    sourceId: string | null;
    retryable: boolean;
    resolvedAt: Date | null;
    message: string;
  }> = [];

  const key = (entityType: string, sourceId: string) => `${entityType}:${sourceId}`;

  return {
    mappings,
    mappingHashes,
    records,
    errors,
    checkpoints,
    async findMapping(entityType: string, sourceId: string) {
      return mappings.get(key(entityType, sourceId)) ?? null;
    },
    async findMappingRecord(entityType: string, sourceId: string) {
      const mappingKey = key(entityType, sourceId);
      const destinationGid = mappings.get(mappingKey);
      if (!destinationGid) return null;
      return {
        destinationGid,
        sourceHash: mappingHashes.get(mappingKey) ?? null,
      };
    },
    async upsertRecord(input: {
      entityType: string;
      sourceId: string;
      status: RecordStatus;
      destinationGid?: string;
    }) {
      const recordKey = key(input.entityType, input.sourceId);
      const existing = records.get(recordKey);
      const record: StoredRecord = {
        id: existing?.id ?? `record-${records.size + 1}`,
        entityType: input.entityType,
        sourceId: input.sourceId,
        status: input.status,
        attempts: (existing?.attempts ?? 0) + 1,
      };
      if (input.destinationGid) record.destinationGid = input.destinationGid;
      records.set(recordKey, record);
      return { id: record.id };
    },
    async upsertMapping(input: {
      entityType: string;
      sourceId: string;
      destinationGid: string;
      sourceHash: string;
    }) {
      const mappingKey = key(input.entityType, input.sourceId);
      mappings.set(mappingKey, input.destinationGid);
      mappingHashes.set(mappingKey, input.sourceHash);
    },
    async checkpoint(entityType: string) {
      return checkpoints.get(entityType) ?? { processed: 0, lastSourceId: null };
    },
    async saveCheckpoint(input: {
      entityType: string;
      processed: number;
      lastSourceId: string;
    }) {
      checkpoints.set(input.entityType, {
        processed: input.processed,
        lastSourceId: input.lastSourceId,
      });
    },
    async recordError(input: {
      entityType: string;
      sourceId: string;
      message: string;
      retryable: boolean;
    }) {
      errors.push({
        id: `error-${errors.length + 1}`,
        entityType: input.entityType,
        sourceId: input.sourceId,
        retryable: input.retryable,
        resolvedAt: null,
        message: input.message,
      });
    },
    async unresolvedRetryableErrors() {
      return errors.filter((error) => error.retryable && !error.resolvedAt);
    },
    async resolveError(id: string) {
      const error = errors.find((item) => item.id === id);
      if (error) error.resolvedAt = new Date();
    },
    async touchError(id: string, message: string) {
      const error = errors.find((item) => item.id === id);
      if (error) error.message = message;
    },
    async updateMigrationCounters() {},
    async shouldPause() {
      return false;
    },
    async pause() {},
  };
}

describe("migration processor pipeline", () => {
  it("migrates two real source products to mocked Shopify GIDs", async () => {
    const store = fakeStore();
    const shopify = fakeShopify(async (_product, sourceId) => ({
      gid: `gid://shopify/Product/${sourceId}`,
    }));

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions: [
        productDefinition([
          { sourceId: "woo-101", title: "First product" },
          { sourceId: "woo-202", title: "Second product" },
        ]),
      ],
      shopify: shopify as never,
      store: store as never,
    });

    expect(shopify.upsertProduct).toHaveBeenCalledTimes(2);
    expect([...store.mappings.values()]).toEqual([
      "gid://shopify/Product/woo-101",
      "gid://shopify/Product/woo-202",
    ]);
    expect([...store.records.values()].map((record) => record.status)).toEqual([
      "CREATED",
      "CREATED",
    ]);
  });

  it("does not create duplicates when mappings already point to existing Shopify resources", async () => {
    const store = fakeStore();
    store.mappings.set("PRODUCT:woo-101", "gid://shopify/Product/existing");
    store.mappingHashes.set(
      "PRODUCT:woo-101",
      sourceHash({ sourceId: "woo-101", title: "First product" }),
    );
    const shopify = fakeShopify(async () => {
      throw new Error("duplicate create should not be called");
    });

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions: [productDefinition([{ sourceId: "woo-101", title: "First product" }])],
      shopify: shopify as never,
      store: store as never,
    });

    expect(shopify.resourceExists).toHaveBeenCalledWith(
      "gid://shopify/Product/existing",
    );
    expect(shopify.upsertProduct).not.toHaveBeenCalled();
    expect(store.records.get("PRODUCT:woo-101")?.status).toBe(
      "DUPLICATE_PREVENTED",
    );
  });

  it("accepts two source records that resolve to the same destination resource", async () => {
    const store = fakeStore();
    store.upsertMapping = vi.fn(async () => {
      throw new Error(
        "Unique constraint failed on the fields: (`migrationId`,`entityType`,`destinationGid`)",
      );
    });
    const shopify = fakeShopify(async () => ({
      gid: "gid://shopify/MailingAddress/existing",
      duplicatePrevented: true,
    }));

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions: [productDefinition([{ sourceId: "shipping-101", title: "Same address" }])],
      shopify: shopify as never,
      store: store as never,
    });

    expect(store.records.get("PRODUCT:shipping-101")).toMatchObject({
      status: "DUPLICATE_PREVENTED",
      destinationGid: "gid://shopify/MailingAddress/existing",
    });
    expect(store.errors).toHaveLength(0);
  });

  it("updates Shopify when a previously mapped source record has changed", async () => {
    const store = fakeStore();
    store.mappings.set("PRODUCT:woo-101", "gid://shopify/Product/existing");
    store.mappingHashes.set(
      "PRODUCT:woo-101",
      sourceHash({ sourceId: "woo-101", title: "Old title" }),
    );
    const shopify = fakeShopify(async () => ({
      gid: "gid://shopify/Product/existing",
    }));

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions: [productDefinition([{ sourceId: "woo-101", title: "New title" }])],
      shopify: shopify as never,
      store: store as never,
    });

    expect(shopify.upsertProduct).toHaveBeenCalledTimes(1);
    expect(store.records.get("PRODUCT:woo-101")?.status).toBe("UPDATED");
  });

  it("keeps failed Shopify mutations failed without creating mappings", async () => {
    const store = fakeStore();
    const shopify = fakeShopify(async () => {
      throw new Error("Shopify returned 422.");
    });

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions: [productDefinition([{ sourceId: "woo-500", title: "Broken" }])],
      shopify: shopify as never,
      store: store as never,
    });

    expect(store.records.get("PRODUCT:woo-500")?.status).toBe("FAILED");
    expect(store.mappings.has("PRODUCT:woo-500")).toBe(false);
    expect(store.errors[0]?.resolvedAt).toBeNull();
  });

  it("retry mode repeats the Shopify API operation for failed transient records", async () => {
    const store = fakeStore();
    let attempts = 0;
    const shopify = fakeShopify(async (_product, sourceId) => {
      attempts += 1;
      if (attempts === 1) throw new Error("Shopify returned 429.");
      return { gid: `gid://shopify/Product/${sourceId}` };
    });
    const definitions = [productDefinition([{ sourceId: "woo-429", title: "Retry me" }])];

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions,
      shopify: shopify as never,
      store: store as never,
    });
    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions,
      shopify: shopify as never,
      store: store as never,
      retryOnly: new Set(["PRODUCT:woo-429"]),
    });

    expect(shopify.upsertProduct).toHaveBeenCalledTimes(2);
    expect(store.records.get("PRODUCT:woo-429")?.status).toBe("CREATED");
    expect(store.mappings.get("PRODUCT:woo-429")).toBe(
      "gid://shopify/Product/woo-429",
    );
  });

  it("dry run reads and normalizes source records without creating Shopify records", async () => {
    const store = fakeStore();
    const shopify = fakeShopify(async (_product, sourceId) => ({
      gid: `gid://shopify/Product/${sourceId}`,
    }));

    await runMigrationPipeline({
      migrationId: "migration-1",
      definitions: [productDefinition([{ sourceId: "woo-101", title: "Preview" }])],
      shopify: shopify as never,
      store: store as never,
      dryRun: true,
    });

    expect(shopify.upsertProduct).not.toHaveBeenCalled();
    expect(store.mappings.size).toBe(0);
    expect(store.records.get("PRODUCT:woo-101")?.status).toBe("NORMALIZED");
  });

  it("does not contain the old fake IDs, fake GIDs, or fixed five-record loops", async () => {
    const source = await readFile(
      new URL("./migration-processor.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("product-1");
    expect(source).not.toContain("media-1");
    expect(source).not.toContain("customer-1");
    expect(source).not.toContain("gid://shopify/${entityType}/${sourceId}");
    expect(source).not.toContain("index < 5");
    expect(source).not.toContain("score: 86");
  });
});
