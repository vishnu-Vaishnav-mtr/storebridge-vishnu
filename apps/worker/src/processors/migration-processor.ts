import type {
  EntityType,
  ErrorCategory,
  MappingRule,
  Prisma,
} from "@storebridge/database";
import { prisma } from "@storebridge/database";
import { buildReconciliation, isRetryable } from "@storebridge/migration-core";
import { ShopifyAdapter } from "@storebridge/shopify-adapter";
import { decryptSecret, stableHash } from "@storebridge/shared";
import type {
  NormalizedAddress,
  NormalizedCollection,
  NormalizedContent,
  NormalizedCustomer,
  NormalizedImage,
  NormalizedInventoryItem,
  NormalizedOrder,
  NormalizedProduct,
  NormalizedRedirect,
  NormalizedVariant,
} from "@storebridge/shared";
import { WooCommerceAdapter } from "@storebridge/woo-adapter";
import { WordPressAdapter } from "@storebridge/wordpress-adapter";
import { publishProgress } from "../events/progress";

type MigrationWithConnections = Prisma.MigrationGetPayload<{
  include: {
    sourceConnection: { include: { credentials: true } };
    targetConnection: { include: { credentials: true } };
    modules: true;
  };
}>;

type SourceRecord<T> = {
  normalized: T;
  raw: unknown;
  hash: string;
};

type EntityDefinition<T> = {
  entityType: EntityType;
  displayName: (record: T) => string;
  sourceId: (record: T) => string;
  records: () => AsyncGenerator<SourceRecord<T>>;
  validate: (record: T) => string[];
  migrate: (record: T, context: MigrationContext) => Promise<MigrationResult>;
};

type AnyEntityDefinition = EntityDefinition<any>;

type MigrationResult = {
  gid: string;
  duplicatePrevented?: boolean;
};

type MigrationContext = {
  migrationId: string;
  shopify: ShopifyDestination;
  findMapping(entityType: EntityType, sourceId: string): Promise<string | null>;
};

type ShopifyDestination = Pick<
  ShopifyAdapter,
  | "resourceExists"
  | "upsertProduct"
  | "upsertCollection"
  | "upsertProductImage"
  | "upsertVariant"
  | "inventoryItemGidForVariant"
  | "inventoryItemGidForProduct"
  | "defaultLocationGid"
  | "updateInventory"
  | "upsertCustomer"
  | "upsertCustomerAddress"
  | "createHistoricalOrder"
  | "upsertPage"
  | "upsertPost"
  | "createUrlRedirect"
>;

type MigrationStore = {
  findMapping(entityType: EntityType, sourceId: string): Promise<string | null>;
  upsertRecord(input: UpsertRecordInput): Promise<{ id: string }>;
  upsertMapping(input: {
    entityType: EntityType;
    sourceId: string;
    sourceHash: string;
    destinationGid: string;
  }): Promise<void>;
  checkpoint(entityType: EntityType): Promise<{
    processed: number;
    lastSourceId: string | null;
  }>;
  saveCheckpoint(input: {
    entityType: EntityType;
    processed: number;
    lastSourceId: string;
    state: Record<string, unknown>;
  }): Promise<void>;
  recordError(input: {
    migrationRecordId?: string;
    entityType: EntityType;
    sourceId: string;
    name: string;
    category: ErrorCategory;
    stage: string;
    message: string;
    retryable: boolean;
    technicalDetails?: Record<string, unknown>;
  }): Promise<void>;
  unresolvedRetryableErrors(): Promise<
    Array<{ id: string; entityType: EntityType | null; sourceId: string | null }>
  >;
  resolveError(id: string): Promise<void>;
  touchError(id: string, message: string): Promise<void>;
  updateMigrationCounters(input: {
    processed?: number;
    failed?: number;
    duplicate?: number;
  }): Promise<void>;
  shouldPause(): Promise<boolean>;
  pause(): Promise<void>;
  mappingRules?(): Promise<MappingRule[]>;
};

type UpsertRecordInput = {
  entityType: EntityType;
  sourceId: string;
  sourceHash: string;
  displayName: string;
  status:
    | "NORMALIZED"
    | "DUPLICATE_PREVENTED"
    | "CREATED"
    | "UPDATED"
    | "FAILED"
    | "SKIPPED";
  normalizedData: unknown;
  destinationGid?: string;
};

export async function processMigrationJob(
  jobName: string,
  data: { migrationId: string; action: string },
) {
  const migration = await loadMigration(data.migrationId);
  if (!migration) throw new Error("Migration not found.");

  if (jobName === "audit") {
    await runSourceAudit(migration);
    return;
  }

  if (jobName === "dry-run") {
    await runDryRun(migration);
    return;
  }

  if (jobName === "verify") {
    await verifyMigration(migration.id, await createShopifyAdapter(migration));
    return;
  }

  if (jobName === "retry-failed") {
    await retryFailed(migration);
    return;
  }

  await runMigration(migration);
}

async function runSourceAudit(migration: MigrationWithConnections) {
  await prisma.migration.update({
    where: { id: migration.id },
    data: { status: "AUDITING", currentStep: 2 },
  });
  await publishProgress(migration.id, "Source audit started.");

  try {
    const results = await collectAuditResults(migration);
    await prisma.$transaction(async (tx) => {
      await tx.auditResult.deleteMany({ where: { migrationId: migration.id } });
      if (results.length > 0) {
        await tx.auditResult.createMany({
          data: results.map((result) => ({
            migrationId: migration.id,
            entityType: result.entityType as EntityType,
            detectedCount: result.detectedCount,
            supportedCount: result.supportedCount,
            needsMapping: result.needsMapping,
            warningCount: result.warningCount,
            unsupportedCount: result.unsupportedCount,
            warnings: result.warnings,
          })),
        });
      }
      await tx.report.create({
        data: {
          migrationId: migration.id,
          type: "SOURCE_AUDIT",
          format: "JSON",
          title: "Source audit report",
          content: {
            results: results as unknown as Prisma.InputJsonValue,
            generatedAt: new Date().toISOString(),
          },
        },
      });
      await tx.migration.update({
        where: { id: migration.id },
        data: {
          status: "READY",
          currentStep: 3,
          totalRecords: results.reduce(
            (sum, result) => sum + result.supportedCount,
            0,
          ),
        },
      });
    });
    await publishProgress(migration.id, "Source audit completed.");
  } catch (error) {
    await prisma.migration.update({
      where: { id: migration.id },
      data: { status: "FAILED" },
    });
    await prisma.migrationError.create({
      data: {
        migrationId: migration.id,
        category: "SOURCE_DATA",
        stage: "audit",
        message:
          error instanceof Error ? error.message : "Source audit failed.",
        retryable: false,
        technicalDetails:
          error instanceof Error ? { name: error.name, stack: error.stack } : {},
      },
    });
    await publishProgress(migration.id, "Source audit failed.");
  }
}

export async function runMigrationPipeline(input: {
  migrationId: string;
  definitions: AnyEntityDefinition[];
  shopify: ShopifyDestination;
  store: MigrationStore;
  dryRun?: boolean;
  retryOnly?: Set<string>;
  publish?: (message: string) => Promise<void>;
}) {
  const publish = input.publish ?? (async () => {});
  const context: MigrationContext = {
    migrationId: input.migrationId,
    shopify: input.shopify,
    findMapping: input.store.findMapping,
  };
  const mappingRules = input.store.mappingRules
    ? await input.store.mappingRules()
    : [];

  for (const definition of input.definitions) {
    const checkpoint = await input.store.checkpoint(definition.entityType);
    let seen = 0;
    for await (const source of definition.records()) {
      seen += 1;
      const sourceId = definition.sourceId(source.normalized);
      if (shouldSkipByMapping(mappingRules, definition.entityType, sourceId)) {
        await input.store.upsertRecord({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          displayName: definition.displayName(source.normalized),
          status: "SKIPPED",
          normalizedData: source.normalized,
        });
        await input.store.updateMigrationCounters({ processed: 1 });
        await input.store.saveCheckpoint({
          entityType: definition.entityType,
          processed: seen,
          lastSourceId: sourceId,
          state: { sourceId, status: "SKIPPED" },
        });
        continue;
      }
      const retryKey = retryKeyFor(definition.entityType, sourceId);
      if (input.retryOnly && !input.retryOnly.has(retryKey)) continue;
      if (!input.retryOnly && seen <= checkpoint.processed) continue;

      if (await input.store.shouldPause()) {
        await input.store.pause();
        await publish("Migration paused from the last completed checkpoint.");
        return { paused: true };
      }

      const mappedRecord = applyRecordMappings(
        definition.entityType,
        source.normalized,
        mappingRules,
      );
      const displayName = definition.displayName(mappedRecord);
      const validationErrors = definition.validate(mappedRecord);
      if (validationErrors.length > 0) {
        const record = await input.store.upsertRecord({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          displayName,
          status: "FAILED",
          normalizedData: mappedRecord,
        });
        await input.store.recordError({
          migrationRecordId: record.id,
          entityType: definition.entityType,
          sourceId,
          name: displayName,
          category: "VALIDATION",
          stage: input.dryRun ? "dry-run" : "migration",
          message: validationErrors.join("; "),
          retryable: false,
        });
        await input.store.updateMigrationCounters({ failed: 1 });
        if (!input.retryOnly)
          await input.store.saveCheckpoint({
            entityType: definition.entityType,
            processed: seen,
            lastSourceId: sourceId,
            state: { sourceId, status: "FAILED" },
          });
        continue;
      }

      if (input.dryRun) {
        await input.store.upsertRecord({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          displayName,
          status: "NORMALIZED",
          normalizedData: mappedRecord,
        });
        await input.store.updateMigrationCounters({ processed: 1 });
        await input.store.saveCheckpoint({
          entityType: definition.entityType,
          processed: seen,
          lastSourceId: sourceId,
          state: { sourceId, status: "NORMALIZED" },
        });
        continue;
      }

      const existingGid = await input.store.findMapping(
        definition.entityType,
        sourceId,
      );
      if (existingGid && (await input.shopify.resourceExists(existingGid))) {
        await input.store.upsertRecord({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          displayName,
          status: "DUPLICATE_PREVENTED",
          destinationGid: existingGid,
          normalizedData: mappedRecord,
        });
        await input.store.updateMigrationCounters({
          processed: 1,
          duplicate: 1,
        });
        await input.store.saveCheckpoint({
          entityType: definition.entityType,
          processed: seen,
          lastSourceId: sourceId,
          state: { sourceId, destinationGid: existingGid },
        });
        continue;
      }

      try {
        const result = await definition.migrate(mappedRecord, context);
        assertRealShopifyGid(result.gid);
        const status = result.duplicatePrevented
          ? "DUPLICATE_PREVENTED"
          : existingGid
            ? "UPDATED"
            : "CREATED";
        await input.store.upsertRecord({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          displayName,
          status,
          destinationGid: result.gid,
          normalizedData: mappedRecord,
        });
        await input.store.upsertMapping({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          destinationGid: result.gid,
        });
        await input.store.updateMigrationCounters({
          processed: 1,
          duplicate: result.duplicatePrevented ? 1 : 0,
        });
        if (!input.retryOnly)
          await input.store.saveCheckpoint({
            entityType: definition.entityType,
            processed: seen,
            lastSourceId: sourceId,
            state: { sourceId, destinationGid: result.gid },
          });
        await publish(`${definition.entityType.toLowerCase()} ${sourceId} migrated.`);
      } catch (error) {
        const classified = classifyError(error);
        const record = await input.store.upsertRecord({
          entityType: definition.entityType,
          sourceId,
          sourceHash: source.hash,
          displayName,
          status: "FAILED",
          normalizedData: mappedRecord,
        });
        await input.store.recordError({
          migrationRecordId: record.id,
          entityType: definition.entityType,
          sourceId,
          name: displayName,
          category: classified.category,
          stage: "migration",
          message: classified.message,
          retryable: classified.retryable,
          technicalDetails: classified.details,
        });
        await input.store.updateMigrationCounters({ failed: 1 });
        if (!input.retryOnly)
          await input.store.saveCheckpoint({
            entityType: definition.entityType,
            processed: seen,
            lastSourceId: sourceId,
            state: { sourceId, status: "FAILED" },
          });
      }
    }
  }

  return { paused: false };
}

async function runDryRun(migration: MigrationWithConnections) {
  await prisma.migration.update({
    where: { id: migration.id },
    data: { status: "DRY_RUNNING", processedRecords: 0, failedRecords: 0 },
  });
  await publishProgress(
    migration.id,
    "Dry run started. StoreBridge is reading source data without writing to Shopify.",
  );

  const definitions = await createEntityDefinitions(migration);
  const result = await runMigrationPipeline({
    migrationId: migration.id,
    definitions,
    shopify: await createShopifyAdapter(migration),
    store: prismaMigrationStore(migration.id),
    dryRun: true,
    publish: (message) => publishProgress(migration.id, message),
  });

  await prisma.validationResult.create({
    data: {
      migrationId: migration.id,
      stage: "dry-run",
      status: result.paused ? "PAUSED" : "READY",
      score: result.paused ? 0 : 100,
      issues: [],
    },
  });
  await prisma.report.create({
    data: {
      migrationId: migration.id,
      type: "DRY_RUN",
      format: "JSON",
      title: "Dry-run report",
      content: {
        status: result.paused ? "PAUSED" : "READY",
        generatedAt: new Date().toISOString(),
      },
    },
  });
  await prisma.migration.update({
    where: { id: migration.id },
    data: {
      status: result.paused ? "PAUSED" : "DRY_RUN_COMPLETE",
      currentStep: result.paused ? 6 : 7,
    },
  });
  await publishProgress(migration.id, "Dry run completed.");
}

async function collectAuditResults(migration: MigrationWithConnections) {
  if (migration.sourceConnection.platform === "WOOCOMMERCE") {
    const woo = new WooCommerceAdapter({
      storeUrl: migration.sourceConnection.url,
      consumerKey: credential(migration.sourceConnection, "consumerKey"),
      consumerSecret: credential(migration.sourceConnection, "consumerSecret"),
      apiVersion: migration.sourceConnection.apiVersion ?? "wc/v3",
      allowPrivateNetwork: process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
    });
    const wooResults = await woo.audit();
    const wordpress = new WordPressAdapter(
      withDefined({
        storeUrl: migration.sourceConnection.url,
        username: credentialOptional(
          migration.sourceConnection,
          "wordpressUsername",
        ),
        applicationPassword: credentialOptional(
          migration.sourceConnection,
          "wordpressApplicationPassword",
        ),
        allowPrivateNetwork: process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
      }),
    );
    const wpResults = await wordpress.auditContent().catch(() => []);
    return mergeAuditResults([...wooResults, ...wpResults]);
  }

  if (migration.sourceConnection.platform === "WORDPRESS") {
    const wordpress = new WordPressAdapter({
      storeUrl: migration.sourceConnection.url,
      allowPrivateNetwork: process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
    });
    return wordpress.auditContent();
  }

  throw new Error("Unsupported source platform for audit.");
}

async function runMigration(migration: MigrationWithConnections) {
  await prisma.migration.update({
    where: { id: migration.id },
    data: {
      status: "RUNNING",
      startedAt: migration.startedAt ?? new Date(),
      processedRecords: 0,
      failedRecords: 0,
      duplicatesPrevented: 0,
    },
  });
  await publishProgress(migration.id, "Migration started.");

  const definitions = await createEntityDefinitions(migration);
  const result = await runMigrationPipeline({
    migrationId: migration.id,
    definitions,
    shopify: await createShopifyAdapter(migration),
    store: prismaMigrationStore(migration.id),
    publish: (message) => publishProgress(migration.id, message),
  });
  if (result.paused) return;

  const final = await prisma.migration.findUnique({
    where: { id: migration.id },
  });
  await prisma.migration.update({
    where: { id: migration.id },
    data: {
      status:
        final && final.failedRecords > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      currentStep: 8,
      completedAt: new Date(),
    },
  });
  await publishProgress(migration.id, "Migration completed.");
}

async function retryFailed(migration: MigrationWithConnections) {
  const store = prismaMigrationStore(migration.id);
  const errors = await store.unresolvedRetryableErrors();
  const retryableKeys = new Set(
    errors
      .filter((error) => error.entityType && error.sourceId)
      .map((error) => retryKeyFor(error.entityType as EntityType, error.sourceId as string)),
  );
  if (retryableKeys.size === 0) return;

  const definitions = await createEntityDefinitions(migration);
  const result = await runMigrationPipeline({
    migrationId: migration.id,
    definitions,
    shopify: await createShopifyAdapter(migration),
    store,
    retryOnly: retryableKeys,
    publish: (message) => publishProgress(migration.id, message),
  });
  if (result.paused) return;

  for (const error of errors) {
    if (!error.entityType || !error.sourceId) continue;
    const mapping = await store.findMapping(error.entityType, error.sourceId);
    if (mapping) await store.resolveError(error.id);
    else await store.touchError(error.id, "Retry attempted but the record is still failed.");
  }
}

async function verifyMigration(
  migrationId: string,
  shopify: Pick<ShopifyDestination, "resourceExists">,
) {
  await publishProgress(migrationId, "Verification started.");
  const mappings = await prisma.entityMapping.findMany({ where: { migrationId } });
  const rows = new Map<
    string,
    { entity: string; source: number; migrated: number; updated: number; skipped: number; failed: number }
  >();

  for (const mapping of mappings) {
    const key = mapping.entityType;
    const row =
      rows.get(key) ??
      { entity: key, source: 0, migrated: 0, updated: 0, skipped: 0, failed: 0 };
    row.source += 1;
    if (await shopify.resourceExists(mapping.destinationGid)) row.migrated += 1;
    else row.failed += 1;
    rows.set(key, row);
  }

  const reconciliation = buildReconciliation([...rows.values()]);
  const failed = reconciliation.some(
    (row) => row.failed > 0 || row.difference !== 0,
  );
  await prisma.report.create({
    data: {
      migrationId,
      type: "RECONCILIATION",
      format: "JSON",
      title: "Reconciliation report",
      content: { rows: reconciliation, generatedAt: new Date().toISOString() },
    },
  });
  await prisma.migration.update({
    where: { id: migrationId },
    data: {
      status: failed ? "PARTIALLY_VERIFIED" : "VERIFIED",
      verifiedAt: new Date(),
    },
  });
  await publishProgress(
    migrationId,
    failed
      ? "Verification completed with missing Shopify resources."
      : "Verification completed successfully.",
  );
}

async function loadMigration(id: string) {
  return prisma.migration.findUnique({
    where: { id },
    include: {
      sourceConnection: { include: { credentials: true } },
      targetConnection: { include: { credentials: true } },
      modules: true,
    },
  });
}

async function createEntityDefinitions(
  migration: MigrationWithConnections,
): Promise<AnyEntityDefinition[]> {
  const woo =
    migration.sourceConnection.platform === "WOOCOMMERCE"
      ? new WooCommerceAdapter({
          storeUrl: migration.sourceConnection.url,
          consumerKey: credential(migration.sourceConnection, "consumerKey"),
          consumerSecret: credential(migration.sourceConnection, "consumerSecret"),
          apiVersion: migration.sourceConnection.apiVersion ?? "wc/v3",
          allowPrivateNetwork: process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
        })
      : null;
  const wordpress =
    migration.sourceConnection.platform === "WOOCOMMERCE" ||
    migration.sourceConnection.platform === "WORDPRESS"
      ? new WordPressAdapter(
          withDefined({
            storeUrl: migration.sourceConnection.url,
            username: credentialOptional(
              migration.sourceConnection,
              "wordpressUsername",
            ),
            applicationPassword: credentialOptional(
              migration.sourceConnection,
              "wordpressApplicationPassword",
            ),
            allowPrivateNetwork:
              process.env.ALLOW_PRIVATE_NETWORK_URLS === "true",
          }),
        )
      : null;

  const enabled = new Set(
    migration.modules
      .filter((module) => module.enabled)
      .map((module) => module.entityType),
  );
  const shouldRun = (entityType: EntityType) =>
    enabled.size === 0 || enabled.has(entityType);

  const definitions: AnyEntityDefinition[] = [];
  if (woo) {
    if (shouldRun("COLLECTION")) definitions.push(collectionDefinition(woo));
    if (shouldRun("PRODUCT")) definitions.push(productDefinition(woo));
    if (shouldRun("VARIANT")) definitions.push(variantDefinition(woo));
    if (shouldRun("MEDIA")) definitions.push(mediaDefinition(woo));
    if (shouldRun("INVENTORY")) definitions.push(inventoryDefinition(woo));
    if (shouldRun("CUSTOMER")) definitions.push(customerDefinition(woo));
    if (shouldRun("CUSTOMER_ADDRESS"))
      definitions.push(customerAddressDefinition(woo));
    if (shouldRun("ORDER")) definitions.push(orderDefinition(woo));
  }
  if (wordpress) {
    if (shouldRun("PAGE")) definitions.push(pageDefinition(wordpress));
    if (shouldRun("POST")) definitions.push(postDefinition(wordpress));
    if (shouldRun("REDIRECT")) definitions.push(redirectDefinition(wordpress));
  }
  return definitions;
}

async function createShopifyAdapter(
  migration: MigrationWithConnections,
): Promise<ShopifyAdapter> {
  if (migration.targetConnection.platform !== "SHOPIFY") {
    throw new Error("Target connection must be Shopify.");
  }
  return new ShopifyAdapter({
    shopDomain: shopDomain(migration.targetConnection.url),
    adminAccessToken: credential(migration.targetConnection, "adminAccessToken"),
    apiVersion: migration.targetConnection.apiVersion ?? "2026-01",
  });
}

function productDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedProduct> {
  return {
    entityType: "PRODUCT",
    records: () => woo.products(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.title,
    validate: (record) => required(record.sourceId, "sourceId", record.title, "title"),
    migrate: (record, context) =>
      context.shopify.upsertProduct(record, record.sourceId),
  };
}

function variantDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedVariant> {
  return {
    entityType: "VARIANT",
    records: () => woo.productVariations(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.title,
    validate: (record) =>
      required(
        record.sourceId,
        "sourceId",
        record.productSourceId,
        "productSourceId",
        record.title,
        "title",
      ),
    migrate: async (record, context) => {
      const productGid = await context.findMapping("PRODUCT", record.productSourceId);
      if (!productGid) throw mappingError("PRODUCT", record.productSourceId);
      return context.shopify.upsertVariant(record, productGid, record.sourceId);
    },
  };
}

function collectionDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedCollection> {
  return {
    entityType: "COLLECTION",
    records: () => woo.productCategories(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.title,
    validate: (record) => required(record.sourceId, "sourceId", record.title, "title"),
    migrate: (record, context) =>
      context.shopify.upsertCollection(record, record.sourceId),
  };
}

function mediaDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedImage & { productSourceId: string }> {
  return {
    entityType: "MEDIA",
    records: () => woo.productImages(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.altText ?? record.url,
    validate: (record) =>
      required(
        record.sourceId,
        "sourceId",
        record.productSourceId,
        "productSourceId",
        record.url,
        "url",
      ),
    migrate: async (record, context) => {
      const productGid = await context.findMapping("PRODUCT", record.productSourceId);
      if (!productGid) throw mappingError("PRODUCT", record.productSourceId);
      return context.shopify.upsertProductImage(record, productGid, record.sourceId);
    },
  };
}

function inventoryDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedInventoryItem> {
  return {
    entityType: "INVENTORY",
    records: () => woo.inventory(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.sku ?? record.sourceId,
    validate: (record) =>
      Number.isFinite(record.quantity)
        ? required(record.sourceId, "sourceId")
        : ["quantity is required."],
    migrate: async (record, context) => {
      const variantGid = record.variantSourceId
        ? await context.findMapping("VARIANT", record.variantSourceId)
        : null;
      const productGid =
        !variantGid && record.productSourceId
          ? await context.findMapping("PRODUCT", record.productSourceId)
          : null;
      if (!variantGid && !productGid)
        throw mappingError(
          record.variantSourceId ? "VARIANT" : "PRODUCT",
          record.variantSourceId ?? record.productSourceId ?? record.sourceId,
        );
      const inventoryItemGid = variantGid
        ? await context.shopify.inventoryItemGidForVariant(variantGid)
        : await context.shopify.inventoryItemGidForProduct(productGid as string);
      const locationGid = await context.shopify.defaultLocationGid(
        record.locationName,
      );
      return context.shopify.updateInventory(
        record,
        inventoryItemGid,
        locationGid,
      );
    },
  };
}

function customerDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedCustomer> {
  return {
    entityType: "CUSTOMER",
    records: () => woo.customers(),
    sourceId: (record) => record.sourceId,
    displayName: (record) =>
      [record.firstName, record.lastName].filter(Boolean).join(" ") ||
      record.email ||
      record.sourceId,
    validate: (record) =>
      required(record.sourceId, "sourceId").concat(
        record.email || record.phone ? [] : ["email or phone is required."],
      ),
    migrate: (record, context) =>
      context.shopify.upsertCustomer(record, record.sourceId),
  };
}

function customerAddressDefinition(
  woo: WooCommerceAdapter,
): EntityDefinition<NormalizedAddress & { customerSourceId: string }> {
  return {
    entityType: "CUSTOMER_ADDRESS",
    records: () => woo.customerAddresses(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.address1 ?? record.sourceId,
    validate: (record) =>
      required(record.sourceId, "sourceId", record.customerSourceId, "customerSourceId"),
    migrate: async (record, context) => {
      const customerGid = await context.findMapping(
        "CUSTOMER",
        record.customerSourceId,
      );
      if (!customerGid) throw mappingError("CUSTOMER", record.customerSourceId);
      return context.shopify.upsertCustomerAddress(
        record,
        customerGid,
        record.sourceId,
      );
    },
  };
}

function orderDefinition(woo: WooCommerceAdapter): EntityDefinition<NormalizedOrder> {
  return {
    entityType: "ORDER",
    records: () => woo.orders(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.name,
    validate: (record) =>
      required(record.sourceId, "sourceId", record.name, "name").concat(
        record.lineItems.length > 0 ? [] : ["at least one line item is required."],
      ),
    migrate: (record, context) =>
      context.shopify.createHistoricalOrder(record, record.sourceId),
  };
}

function pageDefinition(
  wordpress: WordPressAdapter,
): EntityDefinition<NormalizedContent> {
  return {
    entityType: "PAGE",
    records: () => wordpress.pages(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.title,
    validate: (record) => required(record.sourceId, "sourceId", record.title, "title"),
    migrate: (record, context) => context.shopify.upsertPage(record, record.sourceId),
  };
}

function postDefinition(
  wordpress: WordPressAdapter,
): EntityDefinition<NormalizedContent> {
  return {
    entityType: "POST",
    records: () => wordpress.posts(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.title,
    validate: (record) => required(record.sourceId, "sourceId", record.title, "title"),
    migrate: (record, context) => context.shopify.upsertPost(record, record.sourceId),
  };
}

function redirectDefinition(
  wordpress: WordPressAdapter,
): EntityDefinition<NormalizedRedirect> {
  return {
    entityType: "REDIRECT",
    records: () => wordpress.redirects(),
    sourceId: (record) => record.sourceId,
    displayName: (record) => record.path,
    validate: (record) =>
      required(record.sourceId, "sourceId", record.path, "path", record.target, "target"),
    migrate: (record, context) =>
      context.shopify.createUrlRedirect(record, record.sourceId),
  };
}

function prismaMigrationStore(migrationId: string): MigrationStore {
  return {
    async findMapping(entityType, sourceId) {
      const mapping = await prisma.entityMapping.findUnique({
        where: {
          migrationId_entityType_sourceId: { migrationId, entityType, sourceId },
        },
      });
      return mapping?.destinationGid ?? null;
    },
    async upsertRecord(input) {
      return prisma.migrationRecord.upsert({
        where: {
          migrationId_entityType_sourceId: {
            migrationId,
            entityType: input.entityType,
            sourceId: input.sourceId,
          },
        },
        update: {
          sourceHash: input.sourceHash,
          displayName: input.displayName,
          status: input.status,
          destinationGid: input.destinationGid ?? null,
          normalizedData: input.normalizedData as Prisma.InputJsonValue,
          attempts: { increment: 1 },
        },
        create: {
          migrationId,
          entityType: input.entityType,
          sourceId: input.sourceId,
          sourceHash: input.sourceHash,
          displayName: input.displayName,
          status: input.status,
          destinationGid: input.destinationGid ?? null,
          normalizedData: input.normalizedData as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
    },
    async upsertMapping(input) {
      await prisma.entityMapping.upsert({
        where: {
          migrationId_entityType_sourceId: {
            migrationId,
            entityType: input.entityType,
            sourceId: input.sourceId,
          },
        },
        update: {
          sourceHash: input.sourceHash,
          destinationGid: input.destinationGid,
        },
        create: {
          migrationId,
          entityType: input.entityType,
          sourceId: input.sourceId,
          sourceHash: input.sourceHash,
          destinationGid: input.destinationGid,
        },
      });
    },
    async checkpoint(entityType) {
      return prisma.migrationCheckpoint.upsert({
        where: { migrationId_entityType: { migrationId, entityType } },
        update: {},
        create: { migrationId, entityType, processed: 0 },
        select: { processed: true, lastSourceId: true },
      });
    },
    async saveCheckpoint(input) {
      await prisma.migrationCheckpoint.upsert({
        where: {
          migrationId_entityType: {
            migrationId,
            entityType: input.entityType,
          },
        },
        update: {
          processed: input.processed,
          lastSourceId: input.lastSourceId,
          state: input.state as Prisma.InputJsonValue,
        },
        create: {
          migrationId,
          entityType: input.entityType,
          processed: input.processed,
          lastSourceId: input.lastSourceId,
          state: input.state as Prisma.InputJsonValue,
        },
      });
    },
    async recordError(input) {
      await prisma.migrationError.create({
        data: {
          migrationId,
          migrationRecordId: input.migrationRecordId ?? null,
          entityType: input.entityType,
          sourceId: input.sourceId,
          name: input.name,
          category: input.category,
          stage: input.stage,
          message: input.message,
          retryable: input.retryable,
          technicalDetails: (input.technicalDetails ?? {}) as Prisma.InputJsonValue,
        },
      });
    },
    unresolvedRetryableErrors() {
      return prisma.migrationError.findMany({
        where: { migrationId, retryable: true, resolvedAt: null },
        select: { id: true, entityType: true, sourceId: true },
      });
    },
    async resolveError(id) {
      await prisma.migrationError.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          attempt: { increment: 1 },
          lastAttemptedAt: new Date(),
        },
      });
    },
    async touchError(id, message) {
      await prisma.migrationError.update({
        where: { id },
        data: {
          message,
          attempt: { increment: 1 },
          lastAttemptedAt: new Date(),
        },
      });
    },
    async updateMigrationCounters(input) {
      await prisma.migration.update({
        where: { id: migrationId },
        data: {
          processedRecords: { increment: input.processed ?? 0 },
          failedRecords: { increment: input.failed ?? 0 },
          duplicatesPrevented: { increment: input.duplicate ?? 0 },
        },
      });
    },
    async shouldPause() {
      const fresh = await prisma.migration.findUnique({
        where: { id: migrationId },
        select: { status: true },
      });
      return fresh?.status === "PAUSING" || fresh?.status === "CANCELLED";
    },
    async pause() {
      const fresh = await prisma.migration.findUnique({
        where: { id: migrationId },
        select: { status: true },
      });
      if (fresh?.status === "CANCELLED") return;
      await prisma.migration.update({
        where: { id: migrationId },
        data: { status: "PAUSED" },
      });
    },
    mappingRules() {
      return prisma.mappingRule.findMany({ where: { migrationId } });
    },
  };
}

function credential(
  connection: MigrationWithConnections["sourceConnection"],
  name: string,
) {
  const value = credentialOptional(connection, name);
  if (!value) throw new Error(`Missing credential ${name}.`);
  return value;
}

function credentialOptional(
  connection: MigrationWithConnections["sourceConnection"],
  name: string,
) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) throw new Error("CREDENTIAL_ENCRYPTION_KEY is required.");
  const secret = connection.credentials
    .filter((credential) => credential.name === name && !credential.deletedAt)
    .sort((a, b) => b.version - a.version)[0];
  if (!secret) return null;
  return decryptSecret(
    {
      algorithm: "aes-256-gcm",
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.authTag,
    },
    key,
  );
}

function shopDomain(url: string) {
  return new URL(url).hostname;
}

function required(...pairs: Array<string | undefined>) {
  const errors: string[] = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const value = pairs[index];
    const name = pairs[index + 1];
    if (!value) errors.push(`${name} is required.`);
  }
  return errors;
}

function mappingError(entityType: EntityType, sourceId: string) {
  const error = new Error(`Missing ${entityType} mapping for source ${sourceId}.`);
  error.name = "StoreBridgeMappingError";
  return error;
}

function classifyError(error: unknown): {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
} {
  const message = error instanceof Error ? error.message : "Migration failed.";
  let category: ErrorCategory = "UNKNOWN";
  if (/missing .* mapping/i.test(message)) category = "MAPPING";
  else if (/401|403|auth/i.test(message)) category = "AUTHENTICATION";
  else if (/429|rate/i.test(message)) category = "RATE_LIMIT";
  else if (/timeout|network|fetch|socket|ECONN/i.test(message))
    category = "NETWORK";
  else if (/permission|scope/i.test(message)) category = "PERMISSION";
  else if (/validation|invalid|required/i.test(message)) category = "VALIDATION";

  return {
    category,
    message,
    retryable: isRetryable(category as never),
    details:
      error instanceof Error
        ? { name: error.name, stack: error.stack }
        : { value: String(error) },
  };
}

function assertRealShopifyGid(gid: string) {
  if (!gid.startsWith("gid://shopify/")) {
    throw new Error("Shopify did not return a valid GID.");
  }
}

function retryKeyFor(entityType: EntityType, sourceId: string) {
  return `${entityType}:${sourceId}`;
}

function withDefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  ) as {
    [K in keyof T as T[K] extends undefined | null ? never : K]: Exclude<
      T[K],
      undefined | null
    >;
  };
}

function mergeAuditResults(
  results: Array<{
    entityType: string;
    detectedCount: number;
    supportedCount: number;
    needsMapping: number;
    warningCount: number;
    unsupportedCount: number;
    warnings: string[];
  }>,
) {
  const merged = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const existing = merged.get(result.entityType);
    if (!existing) {
      merged.set(result.entityType, { ...result });
      continue;
    }
    existing.detectedCount += result.detectedCount;
    existing.supportedCount += result.supportedCount;
    existing.needsMapping += result.needsMapping;
    existing.warningCount += result.warningCount;
    existing.unsupportedCount += result.unsupportedCount;
    existing.warnings.push(...result.warnings);
  }
  return [...merged.values()];
}

function shouldSkipByMapping(
  rules: MappingRule[],
  entityType: EntityType,
  sourceId: string,
) {
  return rules.some(
    (rule) =>
      rule.action === "SKIP" &&
      (rule.sourceKey === sourceId ||
        rule.sourceKey === entityType ||
        rule.sourceKey === `${entityType}:${sourceId}`),
  );
}

function applyRecordMappings<T>(
  entityType: EntityType,
  record: T,
  rules: MappingRule[],
): T {
  if (entityType !== "PRODUCT" || !record || typeof record !== "object") {
    return record;
  }
  const product = record as unknown as NormalizedProduct;
  const attributeRules = rules.filter((rule) => rule.ruleType === "ATTRIBUTE");
  if (attributeRules.length === 0) return record;

  const mapped: NormalizedProduct = {
    ...product,
    tags: [...product.tags],
    options: [...product.options],
    metafields: [...product.metafields],
  };

  for (const rule of attributeRules) {
    const option = mapped.options.find((item) => item.name === rule.sourceKey);
    if (!option) continue;
    if (rule.action === "SKIP") {
      mapped.options = mapped.options.filter((item) => item.name !== rule.sourceKey);
    } else if (rule.action === "TAG") {
      mapped.tags.push(...option.values);
      mapped.options = mapped.options.filter((item) => item.name !== rule.sourceKey);
    } else if (rule.action === "METAFIELD") {
      mapped.metafields.push({
        namespace: "storebridge",
        key: (rule.targetKey ?? rule.sourceKey).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        type: "single_line_text_field",
        value: option.values.join(", "),
      });
      mapped.options = mapped.options.filter((item) => item.name !== rule.sourceKey);
    } else if (rule.action === "OPTION" && rule.targetKey) {
      mapped.options = mapped.options.map((item) =>
        item.name === rule.sourceKey ? { ...item, name: rule.targetKey as string } : item,
      );
    }
  }

  return mapped as T;
}

export function sourceHash(record: unknown) {
  return stableHash(record);
}
