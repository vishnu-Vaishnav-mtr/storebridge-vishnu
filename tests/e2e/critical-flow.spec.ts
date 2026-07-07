import { test, expect } from "@playwright/test";

test("merchant can see the core StoreBridge workflow", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "StoreBridge" }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/stores");
  await expect(page.getByText("WooCommerce source store")).toBeVisible();
  await expect(page.getByText("Shopify destination store")).toBeVisible();
  await page.goto("/new-migration");
  await expect(page.getByText("1. Select Stores")).toBeVisible();
  await expect(page.getByText("6. Dry Run and Import Files")).toBeVisible();
  await page.goto("/migrations");
  await expect(page.getByRole("heading", { name: "Migrations", level: 1 })).toBeVisible();
});
