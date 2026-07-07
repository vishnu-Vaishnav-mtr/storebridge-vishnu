import bcrypt from "bcryptjs";
import { prisma } from "../src/index";

async function main() {
  const passwordHash = await bcrypt.hash("StoreBridgeDemo!123", 12);

  const owner = await prisma.user.upsert({
    where: { email: "demo@storebridge.local" },
    update: {},
    create: {
      email: "demo@storebridge.local",
      name: "Demo Owner",
      emailVerified: new Date(),
      passwordHash,
    },
  });

  const organisation = await prisma.organisation.upsert({
    where: { slug: "demo-workspace" },
    update: {},
    create: {
      name: "Demo Workspace",
      slug: "demo-workspace",
      members: {
        create: {
          userId: owner.id,
          role: "OWNER",
        },
      },
    },
  });

  const source = await prisma.storeConnection.create({
    data: {
      organisationId: organisation.id,
      name: "Demo WooCommerce Store",
      platform: "DEMO_WOOCOMMERCE",
      status: "CONNECTED",
      url: "https://demo-woocommerce.storebridge.local",
      apiVersion: "wc/v3",
      lastCheckedAt: new Date(),
      metadata: {
        storeName: "Demo Woo Store",
        wooVersion: "9.x",
        wordpressVersion: "6.x",
        currency: "USD",
        timezone: "America/New_York",
        detectedProductCount: 20,
      },
    },
  });

  const target = await prisma.storeConnection.create({
    data: {
      organisationId: organisation.id,
      name: "Demo Shopify Store",
      platform: "DEMO_SHOPIFY",
      status: "CONNECTED",
      url: "https://demo-store.myshopify.com",
      apiVersion: "2026-01",
      lastCheckedAt: new Date(),
      metadata: {
        shopName: "Demo Shopify",
        primaryCurrency: "USD",
        timezone: "EST",
        grantedScopes: [
          "write_products",
          "write_customers",
          "write_orders",
          "write_content",
          "write_files",
        ],
        missingScopes: [],
      },
    },
  });

  const migration = await prisma.migration.create({
    data: {
      organisationId: organisation.id,
      sourceConnectionId: source.id,
      targetConnectionId: target.id,
      name: "Demo Store Migration",
      status: "PAUSED",
      totalRecords: 42,
      processedRecords: 18,
      failedRecords: 2,
      duplicatesPrevented: 1,
      currentStep: 7,
      configuration: {
        create: {
          modules: {
            products: true,
            productImages: true,
            customers: true,
            orders: true,
            redirects: true,
          },
          mappings: {
            categoryMode: "automatic",
            attributes: "product_options",
          },
          options: {
            duplicateStrategy: "SKIP_EXISTING",
            batchSize: 25,
            maxRetries: 3,
          },
        },
      },
      modules: {
        create: [
          {
            entityType: "PRODUCT",
            enabled: true,
            status: "SELECTED",
            sourceCount: 20,
            warningCount: 2,
          },
          {
            entityType: "CUSTOMER",
            enabled: true,
            status: "SELECTED",
            sourceCount: 12,
            warningCount: 1,
          },
          {
            entityType: "ORDER",
            enabled: true,
            status: "SELECTED",
            sourceCount: 10,
            warningCount: 1,
          },
          {
            entityType: "MEDIA",
            enabled: true,
            status: "SELECTED",
            sourceCount: 20,
            warningCount: 1,
          },
        ],
      },
      auditResults: {
        create: [
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
        ],
      },
      errors: {
        create: [
          {
            entityType: "CUSTOMER",
            sourceId: "customer-8",
            name: "Invalid customer",
            category: "VALIDATION",
            stage: "normalize",
            message: "Customer email is invalid.",
            retryable: false,
          },
          {
            entityType: "MEDIA",
            sourceId: "image-14",
            name: "Broken product image",
            category: "NETWORK",
            stage: "download",
            message: "The source image URL could not be downloaded.",
            retryable: true,
          },
        ],
      },
      logs: {
        create: [
          { level: "INFO", message: "Demo migration started." },
          {
            level: "SUCCESS",
            entityType: "PRODUCT",
            sourceId: "product-1",
            message: 'Product "Canvas Tote" was migrated successfully.',
          },
          {
            level: "WARNING",
            entityType: "PRODUCT",
            sourceId: "product-4",
            message:
              "Duplicate SKU prevented a second product from being created.",
          },
          {
            level: "ERROR",
            entityType: "MEDIA",
            sourceId: "image-14",
            message: "One product image could not be downloaded.",
          },
        ],
      },
      reports: {
        create: [
          {
            type: "DRY_RUN",
            format: "JSON",
            title: "Demo dry-run report",
            content: {
              status: "READY_WITH_WARNINGS",
              unsupported: 1,
              warnings: 4,
            },
          },
          {
            type: "RECONCILIATION",
            format: "JSON",
            title: "Demo reconciliation report",
            content: {
              rows: [
                {
                  entity: "Products",
                  source: 20,
                  migrated: 17,
                  updated: 0,
                  skipped: 1,
                  failed: 2,
                  difference: 0,
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.workerHeartbeat.upsert({
    where: { workerId: "demo-worker" },
    update: {
      status: "healthy",
      lastSeenAt: new Date(),
      metrics: { activeJobs: 1 },
    },
    create: {
      workerId: "demo-worker",
      queueName: "migrations",
      status: "healthy",
      metrics: { activeJobs: 1 },
    },
  });

  await prisma.activityLog.createMany({
    data: [
      {
        organisationId: organisation.id,
        userId: owner.id,
        storeConnectionId: source.id,
        action: "connection.connected",
        message: "Demo WooCommerce store connected.",
      },
      {
        organisationId: organisation.id,
        userId: owner.id,
        storeConnectionId: target.id,
        action: "connection.connected",
        message: "Demo Shopify store connected.",
      },
      {
        organisationId: organisation.id,
        userId: owner.id,
        action: "migration.paused",
        message: `Migration ${migration.name} paused from the last checkpoint.`,
      },
    ],
    skipDuplicates: true,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
