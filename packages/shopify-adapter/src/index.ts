import type {
  AdapterConnectionResult,
  NormalizedAddress,
  NormalizedCollection,
  NormalizedContent,
  NormalizedCustomer,
  NormalizedImage,
  NormalizedInventoryItem,
  NormalizedOrder,
  NormalizedProduct,
  NormalizedRedirect,
  NormalizedSeoFields,
  NormalizedVariant,
} from "@storebridge/shared";
import { stableHash } from "@storebridge/shared";

export interface ShopifyConnectionOptions {
  shopDomain: string;
  adminAccessToken?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  apiVersion?: string;
}

export class ShopifyAdapter {
  private cachedAccessToken?: string;
  private accessTokenExpiresAt = 0;

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
        "write_inventory",
        "read_locations",
        "write_online_store_navigation",
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
    existingDestinationGid?: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing =
      existingDestinationGid ??
      (await this.findProductBySourceId(sourceId)) ??
      (product.handle
        ? await this.findProductByHandleAndSourceId(product.handle, sourceId)
        : null);
    const productInput = {
      title: product.title,
      handle: product.handle,
      descriptionHtml: product.descriptionHtml,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      status: product.status,
      seo: seoInput(product.seo),
      productOptions: product.options.map((option) => ({
        name: option.name,
        values: option.values.map((name) => ({ name })),
      })),
      metafields: [
        ...product.metafields,
        {
          namespace: "storebridge",
          key: "source_product_id",
          type: "single_line_text_field",
          value: sourceId,
        },
      ],
    };

    if (existing) {
      const response = await this.graphql<{
        productUpdate: {
          product: { id: string } | null;
          userErrors: Array<{ message: string }>;
        };
      }>(
        `mutation StoreBridgeProductUpdate($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product { id }
            userErrors { message }
          }
        }`,
        { product: { ...productInput, id: existing, productOptions: undefined } },
      );
      const error = response.productUpdate.userErrors[0];
      if (error) throw new Error(error.message);
      await this.updateDefaultVariant(existing, product);
      return { gid: existing, duplicatePrevented: false };
    }

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
        product: productInput,
      },
    );

    const error = response.productCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.productCreate.product?.id;
    if (!gid) throw new Error("Shopify did not return a product ID.");
    await this.updateDefaultVariant(gid, product);
    return { gid, duplicatePrevented: false };
  }

  async addProductToCollections(productGid: string, collectionGids: string[]) {
    for (const collectionGid of collectionGids) {
      const response = await this.graphql<{
        collectionAddProducts: { userErrors: Array<{ message: string }> };
      }>(
        `mutation StoreBridgeCollectionAddProduct($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            userErrors { message }
          }
        }`,
        { id: collectionGid, productIds: [productGid] },
      );
      const error = response.collectionAddProducts.userErrors[0];
      if (error && !/already|exists/i.test(error.message)) {
        throw new Error(error.message);
      }
    }
  }

  async resourceExists(gid: string): Promise<boolean> {
    const response = await this.graphql<{ node: { id: string } | null }>(
      `query StoreBridgeNodeExists($id: ID!) {
        node(id: $id) { id }
      }`,
      { id: gid },
    );
    return response.node?.id === gid;
  }

  async upsertCollection(
    collection: NormalizedCollection,
    sourceId: string,
    existingDestinationGid?: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing =
      existingDestinationGid ??
      (await this.findBySourceMetafield(
        "collections",
        "source_collection_id",
        sourceId,
      ));
    if (existing) {
      const response = await this.graphql<{
        collectionUpdate: {
          collection: { id: string } | null;
          userErrors: Array<{ message: string }>;
        };
      }>(
        `mutation StoreBridgeCollectionUpdate($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection { id }
            userErrors { message }
          }
        }`,
        {
          input: withDefined({
            id: existing,
            title: collection.title,
            handle: collection.handle,
            descriptionHtml: collection.descriptionHtml,
            seo: seoInput(collection.seo),
          }),
        },
      );
      const error = response.collectionUpdate.userErrors[0];
      if (error) throw new Error(error.message);
      return { gid: existing, duplicatePrevented: false };
    }
    const response = await this.graphql<{
      collectionCreate: {
        collection: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeCollectionCreate($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id }
          userErrors { message }
        }
      }`,
      {
        input: withDefined({
          title: collection.title,
          handle: collection.handle,
          descriptionHtml: collection.descriptionHtml,
          seo: seoInput(collection.seo),
          metafields: sourceMetafield("source_collection_id", sourceId),
        }),
      },
    );
    const error = response.collectionCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.collectionCreate.collection?.id;
    if (!gid) throw new Error("Shopify did not return a collection ID.");
    return { gid, duplicatePrevented: false };
  }

  async upsertProductImage(
    image: NormalizedImage & { productSourceId: string },
    productGid: string,
    sourceId: string,
    existingDestinationGid?: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = existingDestinationGid;
    if (existing) return { gid: existing, duplicatePrevented: true };
    const response = await this.graphql<{
      productCreateMedia: {
        media: Array<{ id: string }>;
        mediaUserErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeProductMediaCreate($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { id }
          mediaUserErrors { message }
        }
      }`,
      {
        productId: productGid,
        media: [
          withDefined({
            mediaContentType: "IMAGE",
            originalSource: image.url,
            alt: image.altText,
          }),
        ],
      },
    );
    const error = response.productCreateMedia.mediaUserErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.productCreateMedia.media[0]?.id;
    if (!gid) throw new Error("Shopify did not return a media ID.");
    await this.setMetafields(gid, sourceMetafield("source_media_id", sourceId));
    return { gid, duplicatePrevented: false };
  }

  async upsertVariant(
    variant: NormalizedVariant,
    productGid: string,
    sourceId: string,
    existingDestinationGid?: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing =
      existingDestinationGid ??
      (await this.findBySourceMetafield(
        "productVariants",
        "source_variant_id",
        sourceId,
      ));
    if (existing) {
      const response = await this.graphql<{
        productVariantsBulkUpdate: {
          productVariants: Array<{ id: string }>;
          userErrors: Array<{ message: string }>;
        };
      }>(
        `mutation StoreBridgeVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { message }
          }
        }`,
        {
          productId: productGid,
          variants: [variantInput(variant, existing)],
        },
      );
      const error = response.productVariantsBulkUpdate.userErrors[0];
      if (error) throw new Error(error.message);
      return { gid: existing, duplicatePrevented: false };
    }
    const response = await this.graphql<{
      productVariantsBulkCreate: {
        productVariants: Array<{ id: string }>;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeVariantCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { message }
        }
      }`,
      {
        productId: productGid,
        variants: [
          variantInput(variant, undefined, sourceId),
        ],
      },
    );
    const error = response.productVariantsBulkCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.productVariantsBulkCreate.productVariants[0]?.id;
    if (!gid) throw new Error("Shopify did not return a variant ID.");
    return { gid, duplicatePrevented: false };
  }

  async updateInventory(
    inventory: NormalizedInventoryItem,
    inventoryItemGid: string,
    locationGid: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const activationKey = stableHash({
      action: "inventory-activate",
      inventoryItemGid,
      locationGid,
    });
    const activation = await this.graphql<{
      inventoryActivate: { userErrors: Array<{ message: string }> };
    }>(
      `mutation StoreBridgeInventoryActivate($inventoryItemId: ID!, $locationId: ID!, $idempotencyKey: String!) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) @idempotent(key: $idempotencyKey) {
          userErrors { message }
        }
      }`,
      {
        inventoryItemId: inventoryItemGid,
        locationId: locationGid,
        idempotencyKey: activationKey,
      },
    );
    const activationError = activation.inventoryActivate.userErrors[0];
    if (activationError && !/already|active/i.test(activationError.message)) {
      throw new Error(activationError.message);
    }

    const response = await this.graphql<{
      inventorySetQuantities: {
        inventoryAdjustmentGroup: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeInventorySet($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          inventoryAdjustmentGroup { id }
          userErrors { message }
        }
      }`,
      {
        idempotencyKey: stableHash({
          action: "inventory-set",
          inventoryItemGid,
          locationGid,
          quantity: inventory.quantity,
          sourceId: inventory.sourceId,
        }),
        input: {
          name: "available",
          reason: "correction",
          referenceDocumentUri: `gid://storebridge/Inventory/${inventory.sourceId}`,
          quantities: [
            {
              inventoryItemId: inventoryItemGid,
              locationId: locationGid,
              quantity: inventory.quantity,
              changeFromQuantity: null,
            },
          ],
        },
      },
    );
    const error = response.inventorySetQuantities.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.inventorySetQuantities.inventoryAdjustmentGroup?.id;
    if (!gid) throw new Error("Shopify did not return an inventory adjustment ID.");
    return { gid, duplicatePrevented: false };
  }

  async inventoryItemGidForVariant(variantGid: string): Promise<string> {
    const response = await this.graphql<{
      productVariant: { inventoryItem: { id: string } | null } | null;
    }>(
      `query StoreBridgeVariantInventoryItem($id: ID!) {
        productVariant(id: $id) {
          inventoryItem { id }
        }
      }`,
      { id: variantGid },
    );
    const gid = response.productVariant?.inventoryItem?.id;
    if (!gid) throw new Error("Shopify did not return an inventory item ID.");
    return gid;
  }

  async inventoryItemGidForProduct(productGid: string): Promise<string> {
    const response = await this.graphql<{
      product: {
        variants: { nodes: Array<{ inventoryItem: { id: string } | null }> };
      } | null;
    }>(
      `query StoreBridgeProductInventoryItem($id: ID!) {
        product(id: $id) {
          variants(first: 1) {
            nodes {
              inventoryItem { id }
            }
          }
        }
      }`,
      { id: productGid },
    );
    const gid = response.product?.variants.nodes[0]?.inventoryItem?.id;
    if (!gid) throw new Error("Shopify did not return an inventory item ID.");
    return gid;
  }

  async defaultLocationGid(locationName?: string): Promise<string> {
    const response = await this.graphql<{
      locations: { nodes: Array<{ id: string; name: string }> };
    }>(
      `query StoreBridgeLocations {
        locations(first: 50, includeInactive: false) {
          nodes { id name }
        }
      }`,
    );
    const match = locationName
      ? response.locations.nodes.find((location) => location.name === locationName)
      : undefined;
    const gid = match?.id ?? response.locations.nodes[0]?.id;
    if (!gid) throw new Error("Shopify did not return an inventory location ID.");
    return gid;
  }

  async upsertCustomer(
    customer: NormalizedCustomer,
    sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "customers",
      "source_customer_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
    const response = await this.graphql<{
      customerCreate: {
        customer: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeCustomerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { message }
        }
      }`,
      {
        input: withDefined({
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          acceptsMarketing: customer.acceptsMarketing,
          metafields: [
            ...customer.metafields,
            ...sourceMetafield("source_customer_id", sourceId),
          ],
        }),
      },
    );
    const error = response.customerCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.customerCreate.customer?.id;
    if (!gid) throw new Error("Shopify did not return a customer ID.");
    return { gid, duplicatePrevented: false };
  }

  async upsertCustomerAddress(
    address: NormalizedAddress & { customerSourceId: string },
    customerGid: string,
    _sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const response = await this.graphql<{
      customerAddressCreate: {
        customerAddress: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeCustomerAddressCreate($customerId: ID!, $address: MailingAddressInput!) {
        customerAddressCreate(customerId: $customerId, address: $address) {
          customerAddress { id }
          userErrors { message }
        }
      }`,
      { customerId: customerGid, address: addressInput(address) },
    );
    const error = response.customerAddressCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.customerAddressCreate.customerAddress?.id;
    if (!gid) throw new Error("Shopify did not return a customer address ID.");
    return { gid, duplicatePrevented: false };
  }

  async createHistoricalOrder(
    order: NormalizedOrder,
    sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "orders",
      "source_order_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
    const response = await this.graphql<{
      orderCreate: {
        order: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeOrderCreate($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) {
          order { id }
          userErrors { message }
        }
      }`,
      {
        order: withDefined({
          name: order.name,
          email: order.email,
          processedAt: order.processedAt,
          currency: order.currencyCode,
          billingAddress: order.billingAddress
            ? addressInput(order.billingAddress)
            : undefined,
          shippingAddress: order.shippingAddress
            ? addressInput(order.shippingAddress)
            : undefined,
          lineItems: order.lineItems.map((item) =>
            withDefined({
              title: item.title,
              quantity: item.quantity,
              sku: item.sku,
              priceSet: item.price
                ? {
                    shopMoney: {
                      amount: item.price,
                      currencyCode: order.currencyCode,
                    },
                  }
                : undefined,
            }),
          ),
          metafields: [
            ...order.metafields,
            ...sourceMetafield("source_order_id", sourceId),
          ],
        }),
      },
    );
    const error = response.orderCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.orderCreate.order?.id;
    if (!gid) throw new Error("Shopify did not return an order ID.");
    return { gid, duplicatePrevented: false };
  }

  async upsertPage(
    page: NormalizedContent,
    sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "pages",
      "source_page_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
    const response = await this.graphql<{
      pageCreate: {
        page: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgePageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id }
          userErrors { message }
        }
      }`,
      {
        page: withDefined({
          title: page.title,
          handle: page.handle,
          body: page.bodyHtml,
          isPublished: page.status === "PUBLISHED",
          seo: seoInput(page.seo),
          metafields: sourceMetafield("source_page_id", sourceId),
        }),
      },
    );
    const error = response.pageCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.pageCreate.page?.id;
    if (!gid) throw new Error("Shopify did not return a page ID.");
    return { gid, duplicatePrevented: false };
  }

  async upsertPost(
    post: NormalizedContent,
    sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "articles",
      "source_post_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
    const blogGid = await this.defaultBlogGid();
    const response = await this.graphql<{
      articleCreate: {
        article: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeArticleCreate($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id }
          userErrors { message }
        }
      }`,
      {
        article: withDefined({
          blogId: blogGid,
          title: post.title,
          handle: post.handle,
          body: post.bodyHtml,
          author: { name: post.author ?? "StoreBridge Import" },
          isPublished: post.status === "PUBLISHED",
          publishedAt: post.publishedAt,
          seo: seoInput(post.seo),
          metafields: sourceMetafield("source_post_id", sourceId),
        }),
      },
    );
    const error = response.articleCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.articleCreate.article?.id;
    if (!gid) throw new Error("Shopify did not return an article ID.");
    return { gid, duplicatePrevented: false };
  }

  async createUrlRedirect(
    redirect: NormalizedRedirect,
    _sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findUrlRedirect(redirect.path);
    if (existing) return { gid: existing, duplicatePrevented: true };
    const response = await this.graphql<{
      urlRedirectCreate: {
        urlRedirect: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeUrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect { id }
          userErrors { message }
        }
      }`,
      {
        urlRedirect: {
          path: redirect.path,
          target: redirect.target,
        },
      },
    );
    const error = response.urlRedirectCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.urlRedirectCreate.urlRedirect?.id;
    if (!gid) throw new Error("Shopify did not return a redirect ID.");
    return { gid, duplicatePrevented: false };
  }

  private async findProductBySourceId(
    sourceId: string,
  ): Promise<string | null> {
    const query = metafieldSearch("source_product_id", sourceId);
    const response = await this.graphql<{
      products: { nodes: Array<{ id: string; metafield: { value: string } | null }> };
    }>(
      `query StoreBridgeProductBySourceId($query: String!) {
        products(first: 10, query: $query) {
          nodes { id metafield(namespace: "storebridge", key: "source_product_id") { value } }
        }
      }`,
      { query },
    );
    return response.products.nodes.find(
      (node) => node.metafield?.value === sourceId,
    )?.id ?? null;
  }

  private async findBySourceMetafield(
    resource: string,
    key: string,
    sourceId: string,
  ): Promise<string | null> {
    const query = metafieldSearch(key, sourceId);
    const response = await this.graphql<
      Record<
        string,
        { nodes: Array<{ id: string; metafield: { value: string } | null }> }
      >
    >(
      `query StoreBridgeResourceBySourceId($query: String!) {
        ${resource}(first: 10, query: $query) {
          nodes { id metafield(namespace: "storebridge", key: "${key}") { value } }
        }
      }`,
      { query },
    );
    return response[resource]?.nodes.find(
      (node) => node.metafield?.value === sourceId,
    )?.id ?? null;
  }

  private async findProductByHandleAndSourceId(
    handle: string,
    sourceId: string,
  ): Promise<string | null> {
    const response = await this.graphql<{
      product: { id: string; metafield: { value: string } | null } | null;
    }>(
      `query StoreBridgeProductByHandle($identifier: ProductIdentifierInput!) {
        product: productByIdentifier(identifier: $identifier) {
          id
          metafield(namespace: "storebridge", key: "source_product_id") { value }
        }
      }`,
      { identifier: { handle } },
    );
    return response.product?.metafield?.value === sourceId
      ? response.product.id
      : null;
  }

  private async updateDefaultVariant(
    productGid: string,
    product: NormalizedProduct,
  ) {
    if (
      !product.sku &&
      !optionalMoney(product.price) &&
      !optionalMoney(product.compareAtPrice)
    )
      return;
    const response = await this.graphql<{
      product: { variants: { nodes: Array<{ id: string }> } } | null;
    }>(
      `query StoreBridgeDefaultVariant($id: ID!) {
        product(id: $id) { variants(first: 1) { nodes { id } } }
      }`,
      { id: productGid },
    );
    const variantGid = response.product?.variants.nodes[0]?.id;
    if (!variantGid) throw new Error("Shopify did not return a default variant.");
    const updated = await this.graphql<{
      productVariantsBulkUpdate: { userErrors: Array<{ message: string }> };
    }>(
      `mutation StoreBridgeDefaultVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { message }
        }
      }`,
      {
        productId: productGid,
        variants: [
          withDefined({
            id: variantGid,
            price: optionalMoney(product.price),
            compareAtPrice: optionalMoney(product.compareAtPrice),
            inventoryItem: withDefined({ sku: product.sku, tracked: true }),
          }),
        ],
      },
    );
    const error = updated.productVariantsBulkUpdate.userErrors[0];
    if (error) throw new Error(error.message);
  }

  private async findUrlRedirect(path: string): Promise<string | null> {
    const response = await this.graphql<{
      urlRedirects: { nodes: Array<{ id: string }> };
    }>(
      `query StoreBridgeUrlRedirect($query: String!) {
        urlRedirects(first: 1, query: $query) { nodes { id } }
      }`,
      { query: `path:${path}` },
    );
    return response.urlRedirects.nodes[0]?.id ?? null;
  }

  private async defaultBlogGid(): Promise<string> {
    const response = await this.graphql<{ blogs: { nodes: Array<{ id: string }> } }>(
      `query StoreBridgeDefaultBlog {
        blogs(first: 1) { nodes { id } }
      }`,
    );
    const gid = response.blogs.nodes[0]?.id;
    if (!gid) throw new Error("Shopify did not return a blog ID for posts.");
    return gid;
  }

  private async setMetafields(
    ownerId: string,
    metafields: Array<{
      namespace: string;
      key: string;
      type: string;
      value: string;
    }>,
  ) {
    const response = await this.graphql<{
      metafieldsSet: { userErrors: Array<{ message: string }> };
    }>(
      `mutation StoreBridgeMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { message }
        }
      }`,
      {
        metafields: metafields.map((metafield) => ({
          ...metafield,
          ownerId,
        })),
      },
    );
    const error = response.metafieldsSet.userErrors[0];
    if (error) throw new Error(error.message);
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
          "x-shopify-access-token": await this.accessToken(),
        },
        signal: AbortSignal.timeout(30_000),
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

  private async accessToken(): Promise<string> {
    if (this.options.adminAccessToken) return this.options.adminAccessToken;
    if (
      this.cachedAccessToken &&
      Date.now() < this.accessTokenExpiresAt - 60_000
    ) {
      return this.cachedAccessToken;
    }
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new Error("Shopify Client ID and Client Secret are required.");
    }

    const response = await fetch(
      `https://${this.options.shopDomain}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(30_000),
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Shopify authentication returned ${response.status}.`);
    }
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new Error("Shopify authentication returned no access token.");
    }
    this.cachedAccessToken = payload.access_token;
    this.accessTokenExpiresAt =
      Date.now() + (payload.expires_in ?? 86_399) * 1000;
    return payload.access_token;
  }
}

function sourceMetafield(key: string, value: string) {
  return [
    {
      namespace: "storebridge",
      key,
      type: "single_line_text_field",
      value,
    },
  ];
}

function metafieldSearch(key: string, value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `metafields.storebridge.${key}:"${escaped}"`;
}

function variantInput(
  variant: NormalizedVariant,
  id?: string,
  sourceId?: string,
) {
  return withDefined({
    id,
    price: optionalMoney(variant.price),
    compareAtPrice: optionalMoney(variant.compareAtPrice),
    inventoryItem: withDefined({ sku: variant.sku, tracked: true }),
    optionValues: id ? undefined : variant.optionValues,
    metafields: sourceId
      ? [
          ...variant.metafields,
          ...sourceMetafield("source_variant_id", sourceId),
        ]
      : undefined,
  });
}

function optionalMoney(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function seoInput(seo: NormalizedSeoFields | undefined) {
  if (!seo?.title && !seo?.description) return undefined;
  return withDefined({
    title: seo.title,
    description: seo.description,
  });
}

function addressInput(address: NormalizedAddress) {
  return withDefined({
    firstName: address.firstName,
    lastName: address.lastName,
    company: address.company,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    country: address.country,
    zip: address.zip,
    phone: address.phone,
  });
}

function withDefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
