import { describe, expect, it } from "vitest";
import { normalizeWooOrder } from "../src/index";

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
