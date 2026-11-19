import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: unauthenticated browser requests are redirected to /login.
 * This is a UX convenience only — every API route and page re-validates the session
 * and authorization on the server (see src/server/auth).
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("xp_session");
  const { pathname } = req.nextUrl;
  if (!hasSession && !pathname.startsWith("/login") && !pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"] };
