import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const publicPaths = ["/login", "/setup", "/u"];
const serverToServerPaths = [
  "/api/integrations/vdc-tc/sync",
  "/api/integrations/vdc-turnier/sync",
  "/api/integrations/vdc-training/sync",
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const headers = new Headers(request.headers);
  headers.set("x-vdc-pathname", pathname);

  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
  const isServerToServer = serverToServerPaths.includes(pathname);
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !isServerToServer && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
