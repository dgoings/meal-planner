import { setupConvexAuthServer } from "@convex-dev/auth/ssr";
import { api } from "@/convex/_generated/api";
import { convexUrl } from "@/lib/convex-url";

/**
 * The route handlers mounted at `/auth/signin`, `/auth/refresh`, and
 * `/auth/signout`. `signIn` lists every function that mints a session; the
 * proxy refuses anything else.
 */
export const auth = setupConvexAuthServer({
  convexUrl,
  refreshSession: api.auth.refreshSession,
  signOut: api.auth.signOut,
  signIn: [
    api.auth.signInWithEmailPassword,
    api.auth.completeSignUpWithEmailPassword,
    api.auth.completePasswordRecovery,
  ],
  cookieOptions: { secure: process.env.NODE_ENV === "production" },
});
