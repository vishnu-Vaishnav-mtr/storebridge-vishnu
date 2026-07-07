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
        },
      },
    );

    const error = response.productCreate.userErrors[0];
    if (error) throw new Error(error.message);
    const gid = response.productCreate.product?.id;
    if (!gid) throw new Error("Shopify did not return a product ID.");
    return { gid, duplicatePrevented: false };
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
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "collections",
      "source_collection_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
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
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "files",
      "source_media_id",
      sourceId,
    );
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
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "productVariants",
      "source_variant_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
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
          withDefined({
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            inventoryItem: withDefined({ sku: variant.sku, tracked: true }),
            optionValues: variant.optionValues,
            metafields: [
              ...variant.metafields,
              ...sourceMetafield("source_variant_id", sourceId),
            ],
          }),
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
    const response = await this.graphql<{
      inventorySetQuantities: {
        inventoryAdjustmentGroup: { id: string } | null;
        userErrors: Array<{ message: string }>;
      };
    }>(
      `mutation StoreBridgeInventorySet($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { id }
          userErrors { message }
        }
      }`,
      {
        input: {
          name: "available",
          reason: "correction",
          quantities: [
            {
              inventoryItemId: inventoryItemGid,
              locationId: locationGid,
              quantity: inventory.quantity,
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
          addresses: customer.addresses.map(addressInput),
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
    sourceId: string,
  ): Promise<{ gid: string; duplicatePrevented: boolean }> {
    const existing = await this.findBySourceMetafield(
      "customerAddresses",
      "source_customer_address_id",
      sourceId,
    );
    if (existing) return { gid: existing, duplicatePrevented: true };
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
    await this.setMetafields(
      gid,
      sourceMetafield("source_customer_address_id", sourceId),
    );
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
          author: post.author,
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
    sourceId: string,
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
    await this.setMetafields(gid, sourceMetafield("source_redirect_id", sourceId));
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

  private async findBySourceMetafield(
    resource: string,
    key: string,
    sourceId: string,
  ): Promise<string | null> {
    const query = `metafield:storebridge.${key}:${sourceId}`;
    const response = await this.graphql<Record<string, { nodes: Array<{ id: string }> }>>(
      `query StoreBridgeResourceBySourceId($query: String!) {
        ${resource}(first: 1, query: $query) { nodes { id } }
      }`,
      { query },
    );
    return response[resource]?.nodes[0]?.id ?? null;
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
