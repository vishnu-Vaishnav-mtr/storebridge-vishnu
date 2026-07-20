import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyAdapter } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("Shopify Dev Dashboard authentication", () => {
  it("exchanges client credentials and reuses the token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token-123", expires_in: 86399 }), {
          status: 200,
        }),
      )
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              shop: {
                name: "Real store",
                myshopifyDomain: "real-store.myshopify.com",
                currencyCode: "USD",
                timezoneAbbreviation: "UTC",
                plan: { displayName: "Basic" },
              },
              appInstallation: { accessScopes: [] },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ShopifyAdapter({
      shopDomain: "real-store.myshopify.com",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    await adapter.testConnection();
    await adapter.testConnection();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://real-store.myshopify.com/admin/oauth/access_token",
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "grant_type=client_credentials",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      "x-shopify-access-token": "token-123",
    });
  });
});
