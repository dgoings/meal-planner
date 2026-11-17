import type { NextRequest } from "next/server";
import { convexAuthNextjsProxy, nextjsProxyRedirect } from "@/lib/convex-auth";

const isAppRoute = (request: NextRequest) => /^\/app(\/|$)/.test(request.nextUrl.pathname);
const isAuthRoute = (request: NextRequest) =>
  ["/sign-in", "/sign-up"].includes(request.nextUrl.pathname);

// The emailed-link landing pages (/validate-email, /reset-password,
// /confirm-email-change) are public: they are neither protected nor
// redirected, because they must work before and after sign-in.
export default convexAuthNextjsProxy(async (request, { isAuthenticated }) => {
  if (isAppRoute(request) && !(await isAuthenticated())) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return nextjsProxyRedirect(request, `/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (isAuthRoute(request) && (await isAuthenticated())) {
    return nextjsProxyRedirect(request, "/app");
  }
});

export const config = {
  // `/auth/*` is excluded: those route handlers manage the session cookies
  // themselves.
  matcher: ["/((?!auth/|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
