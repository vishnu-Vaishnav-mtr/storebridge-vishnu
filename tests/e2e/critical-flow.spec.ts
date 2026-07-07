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

test("reachable navigation routes do not produce unexpected 404 or 500 pages", async ({
  page,
}) => {
  const routes = [
    "/",
    "/login",
    "/register",
    "/dashboard",
    "/stores",
    "/new-migration",
    "/migrations",
    "/mappings",
    "/reports",
    "/activity",
    "/team",
    "/settings",
    "/help",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(500);
    await expect(page.getByText(/404|500|Application error/i)).toHaveCount(0);
  }
});

test("public primary CTAs have concrete destinations", async ({ page }) => {
  await page.goto("/");

  const start = page.getByRole("link", { name: /Start a Migration/i });
  await expect(start).toHaveAttribute("href", "/new-migration");

  const login = page.getByRole("link", { name: "Login" });
  await expect(login).toHaveAttribute("href", "/login");

  const register = page.getByRole("link", { name: "Register" });
  await expect(register).toHaveAttribute("href", "/register");
});
