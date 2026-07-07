import { NextResponse } from "next/server";
import { auth } from "./auth-edge";
import { isProtectedPath } from "./lib/access";

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isProtectedPath(pathname) && !request.auth) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && request.auth) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
