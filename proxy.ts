import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const publicPaths = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const headers = new Headers(request.headers);
  headers.set("x-vdc-pathname", pathname);

  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
