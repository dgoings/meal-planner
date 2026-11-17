import { setupEmailPassword } from "@convex-dev/auth/methods/email-password/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { components, internal } from "./_generated/api";
import { env } from "./_generated/server";

// The emailed links must be absolute, so they are built from the frontend
// origin the deployment is configured with.
const siteUrl = (env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const senderName = env.SENDER_NAME ?? "PerfectPlate";
const senderEmail = env.SENDER_EMAIL ?? "onboarding@resend.dev";

const auth = setupConvexAuth({ component: components.auth });

export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  signUpWithEmailPassword,
  completeSignUpWithEmailPassword,
  signInWithEmailPassword,
  changePassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
  startChangeEmail,
  completeChangeEmail,
} = setupEmailPassword(auth, {
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
