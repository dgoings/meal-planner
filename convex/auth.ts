import {
  setupEmailPassword,
  type CompleteChangeEmailResult,
} from "@convex-dev/auth/methods/email-password/server";
import { getAuthUserId, setupConvexAuth } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import { env, mutation } from "./_generated/server";
import { copyVerifiedEmail } from "./users";

// The emailed links must be absolute, so they are built from the frontend
// origin the deployment is configured with.
const siteUrl = (env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const senderName = env.SENDER_NAME ?? "PerfectPlate";
const senderEmail = env.SENDER_EMAIL ?? "onboarding@resend.dev";

const auth = setupConvexAuth({ component: components.auth });

export const { signOut, refreshSession, isAuthenticated } = auth;

const emailPassword = setupEmailPassword(auth, {
  component: components.authEmail,
  passwordComponent: components.authPassword,
  emailSender: {
    kind: "resend",
    sendEmail: components.resend.lib.sendEmail,
    apiKey: env.RESEND_API_KEY ?? "",
    from: `${senderName} <${senderEmail}>`,
  },
  urls: {
    signUp: `${siteUrl}/validate-email`,
    changeEmail: `${siteUrl}/confirm-email-change`,
    recovery: `${siteUrl}/reset-password`,
  },
}).attachUserCallbacks({
  createUser: internal.users.createUserEmailPassword,
  onSignIn: internal.users.syncUserEmail,
});

export const {
  signUpWithEmailPassword,
  completeSignUpWithEmailPassword,
  signInWithEmailPassword,
  changePassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
  startChangeEmail,
} = emailPassword;

/**
 * Convex Auth's own email-change completion, which `completeChangeEmail`
 * runs. Convex Auth builds it as a public mutation, so it is callable
 * directly; doing so only skips the `users.email` refresh, which the next
 * sign-in repairs, and forwarded mail never relies on `users.email` alone.
 */
export const completeChangeEmailInAuth = emailPassword.completeChangeEmail;

/**
 * Completes an email change, then copies the new address onto `users.email`.
 * Convex Auth mints no session for an email change, so `onSignIn` does not
 * run and would otherwise leave the old address on the user.
 */
export const completeChangeEmail = mutation({
  args: { emailCode: v.string(), browserSecret: v.string() },
  handler: async (ctx, args): Promise<CompleteChangeEmailResult> => {
    const result: CompleteChangeEmailResult = await ctx.runMutation(
      api.auth.completeChangeEmailInAuth,
      args,
    );
    if (result.success) {
      const userId = await getAuthUserId(ctx);
      if (userId !== null) await copyVerifiedEmail(ctx, userId);
    }
    return result;
  },
});
