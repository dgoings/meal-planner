import { setupConvexAuthNextjs } from "@convex-dev/auth/ssr/nextjs";
import { api } from "@/convex/_generated/api";
import { convexUrl } from "@/lib/convex-url";

export const {
  convexAuthNextjsProxy,
  nextjsProxyRedirect,
  convexAuthNextjsAccessToken,
  isAuthenticatedNextjs,
  ConvexAuthNextjsServerProvider,
} = setupConvexAuthNextjs({
  convexUrl,
  refreshSession: api.auth.refreshSession,
  isAuthenticated: api.auth.isAuthenticated,
});
