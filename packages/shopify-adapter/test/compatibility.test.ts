import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyAdapter } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

function graphqlResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

function adapter() {
  return new ShopifyAdapter({
    shopDomain: "destination.myshopify.com",
    adminAccessToken: "token",
    apiVersion: "2026-07",
  });
}

describe("Shopify 2026-07 compatibility", () => {
  it("omits blank product money values from the default variant update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlResponse({
          productUpdate: { product: { id: "gid://shopify/Product/1" }, userErrors: [] },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          product: { variants: { nodes: [{ id: "gid://shopify/ProductVariant/1" }] } },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({ productVariantsBulkUpdate: { userErrors: [] } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await adapter().upsertProduct(
      {
        sourceId: "1",
        title: "Blank price",
        status: "ACTIVE",
        tags: [],
        collectionSourceIds: [],
        sku: "SKU-1",
        price: "",
        compareAtPrice: "  ",
        images: [],
        options: [],
        metafields: [],
      },
      "1",
      "gid://shopify/Product/1",
    );

    const body = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(body.variables.variants[0]).not.toHaveProperty("price");
    expect(body.variables.variants[0]).not.toHaveProperty("compareAtPrice");
  });

  it("recovers a partially created product only when its source metafield matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(graphqlResponse({ products: { nodes: [] } }))
      .mockResolvedValueOnce(
        graphqlResponse({
          product: {
            id: "gid://shopify/Product/1",
            metafield: { value: "source-1" },
          },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          productUpdate: { product: { id: "gid://shopify/Product/1" }, userErrors: [] },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter().upsertProduct(
      {
        sourceId: "source-1",
        title: "Recovered product",
        handle: "recovered-product",
        status: "ACTIVE",
        tags: [],
        collectionSourceIds: [],
        images: [],
        options: [],
        metafields: [],
      },
      "source-1",
    );

    expect(result.gid).toBe("gid://shopify/Product/1");
    const recoveryQuery = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    );
    expect(recoveryQuery.query).toContain("productByIdentifier");
    expect(recoveryQuery.variables.identifier).toEqual({
      handle: "recovered-product",
    });
  });

  it("uses the persisted media mapping instead of querying File.metafield", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter().upsertProductImage(
      {
        sourceId: "media-1",
        productSourceId: "product-1",
        url: "https://example.com/image.jpg",
      },
      "gid://shopify/Product/1",
      "media-1",
      "gid://shopify/MediaImage/1",
    );

    expect(result).toEqual({
      gid: "gid://shopify/MediaImage/1",
      duplicatePrevented: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds deterministic idempotency keys to inventory mutations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlResponse({ inventoryActivate: { userErrors: [] } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          inventorySetQuantities: {
            inventoryAdjustmentGroup: { id: "gid://shopify/InventoryAdjustmentGroup/1" },
            userErrors: [],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await adapter().updateInventory(
      { sourceId: "inventory-1", quantity: 4 },
      "gid://shopify/InventoryItem/1",
      "gid://shopify/Location/1",
    );

    const requests = fetchMock.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)),
    );
    expect(requests[0].query).toContain("@idempotent(key: $idempotencyKey)");
    expect(requests[1].query).toContain("@idempotent(key: $idempotencyKey)");
    expect(requests[0].variables.idempotencyKey).toHaveLength(64);
    expect(requests[1].variables.idempotencyKey).toHaveLength(64);
    expect(requests[1].variables.input).not.toHaveProperty(
      "ignoreCompareQuantity",
    );
    expect(requests[1].variables.input.quantities[0]).toHaveProperty(
      "changeFromQuantity",
      null,
    );
  });

  it("treats an inventory quantity no-op as a successful duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlResponse({ inventoryActivate: { userErrors: [] } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          inventorySetQuantities: {
            inventoryAdjustmentGroup: null,
            userErrors: [],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter().updateInventory(
      { sourceId: "inventory-1", quantity: 4 },
      "gid://shopify/InventoryItem/1",
      "gid://shopify/Location/1",
    );

    expect(result).toEqual({
      gid: "gid://shopify/InventoryItem/1",
      duplicatePrevented: true,
    });
  });

  it("recovers a partially created page by handle and source metafield", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(graphqlResponse({ pages: { nodes: [] } }))
      .mockResolvedValueOnce(
        graphqlResponse({
          pages: {
            nodes: [
              {
                id: "gid://shopify/Page/1",
                handle: "about-us",
                metafield: { value: "page-1" },
              },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await adapter().upsertPage(
      {
        sourceId: "page-1",
        title: "About us",
        handle: "about-us",
        bodyHtml: "<p>About us</p>",
        status: "PUBLISHED",
        metafields: [],
      },
      "page-1",
    );

    expect(result).toEqual({
      gid: "gid://shopify/Page/1",
      duplicatePrevented: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
