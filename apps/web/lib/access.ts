export const protectedPrefixes = [
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

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function unauthenticatedRedirect(pathname: string, search = "") {
  if (!isProtectedPath(pathname)) return null;
  const params = new URLSearchParams({ callbackUrl: `${pathname}${search}` });
  return `/login?${params.toString()}`;
}
