import { test, expect } from "@playwright/test";

test("logged-out merchant sees public entry points and protected redirects", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "StoreBridge" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await page.goto("/stores");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fstores/);

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Freports/);
});
