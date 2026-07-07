import { describe, expect, it } from "vitest";
import { isProtectedPath, unauthenticatedRedirect } from "../lib/access";

describe("route protection", () => {
  it("redirects unauthenticated dashboard access", () => {
    expect(unauthenticatedRedirect("/dashboard")).toBe(
      "/login?callbackUrl=%2Fdashboard",
    );
  });

  it("redirects unauthenticated stores access", () => {
    expect(unauthenticatedRedirect("/stores", "?tab=source")).toBe(
      "/login?callbackUrl=%2Fstores%3Ftab%3Dsource",
    );
  });

  it("redirects unauthenticated reports access", () => {
    expect(unauthenticatedRedirect("/reports")).toBe(
      "/login?callbackUrl=%2Freports",
    );
  });

  it("allows authenticated dashboard route classification", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/")).toBe(false);
    expect(unauthenticatedRedirect("/")).toBeNull();
  });
});
