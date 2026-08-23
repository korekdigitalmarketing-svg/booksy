import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { getSessionUser } from "./lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const { user, response } = await getSessionUser(request);
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // /login and /auth/callback are host-only utility routes with no
  // locale prefix and no auth gate of their own (the gate is the point of
  // /login) — they pass straight through, untouched by intl negotiation.
  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  // Everything except /api, Next.js internals, and static files runs
  // through proxy() — public locale-prefixed paths go to next-intl,
  // /dashboard gets the auth gate, /login and /auth pass through as-is.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
