import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeWooOrder, WooCommerceAdapter } from "../src/index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WooCommerce order normalization", () => {
  it("preserves numeric line-item prices", () => {
    const order = normalizeWooOrder({
      id: 3014,
      number: "3014",
      currency: "EUR",
      line_items: [
        {
          name: "Smoothing Serum",
          quantity: 1,
          price: 18.5,
          total: "18.50",
        },
      ],
    });

    expect(order.lineItems[0]?.price).toBe("18.5");
  });

  it("derives the actual unit price from Woo's line total when needed", () => {
    const order = normalizeWooOrder({
      id: 3007,
      number: "3007",
      currency: "EUR",
      line_items: [
        {
          name: "Cream Conditioner",
          quantity: 2,
          total: "37.00",
        },
      ],
    });

    expect(order.lineItems[0]?.price).toBe("18.5");
  });
});

describe("WooCommerce media normalization", () => {
  it("keeps repeated WordPress media as separate product associations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            { id: 101, images: [{ id: 900, src: "https://store.test/shared.jpg" }] },
            { id: 202, images: [{ id: 900, src: "https://store.test/shared.jpg" }] },
          ]),
          { status: 200, headers: { "x-wp-totalpages": "1" } },
        ),
      ),
    );
    const adapter = new WooCommerceAdapter({
      storeUrl: "https://store.test",
      consumerKey: "consumer-key",
      consumerSecret: "consumer-secret",
    });

    const sourceIds: string[] = [];
    for await (const image of adapter.productImages()) {
      sourceIds.push(image.normalized.sourceId);
    }

    expect(sourceIds).toEqual(["900", "900:202"]);
  });
});
