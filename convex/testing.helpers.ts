// Test-only helpers for backend tests that need Convex Auth. This module
// defines no Convex functions. The second dot in the file name keeps Convex
// from bundling it: the auth test helpers use `import.meta.glob`, which only
// Vitest understands.
import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import {
  registerEmail,
  registerResendStub,
  sentEmails,
} from "@convex-dev/auth/components/email/test";
import { registerPassword } from "@convex-dev/auth/components/password/test";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

/** A client IP for auth calls, which the email component rate-limits per IP. */
const TEST_CLIENT_IP = "203.0.113.7";

export const TEST_PASSWORD = "correct horse battery staple";

export type AuthTest = ReturnType<typeof initAuthTest>;

/**
 * A `convexTest` instance with the auth components mounted as in
 * `convex.config.ts`, and a stub in place of Resend that records emails
 * instead of sending them.
 */
export function initAuthTest() {
  // A deployment always sets this; Convex Auth reads it to check the issuer
  // of the tokens it minted.
  process.env.CONVEX_CLOUD_URL ??= "https://test-deployment.convex.cloud";
  const t = convexTest(schema, modules);
  const registrable = t as unknown as Parameters<typeof registerCore>[0];
  registerCore(registrable);
  registerPassword(registrable);
  registerEmail(registrable);
  registerResendStub(registrable);
  return t;
}

/** The accessor for calls that come from a browser, which carry a client IP. */
export function fromBrowser(t: AuthTest) {
  return t.withRequestMetadata({ ip: TEST_CLIENT_IP });
}

/**
 * Sign up `email` without opening the emailed link. Returns the secret the
 * starting browser keeps for completing the sign-up.
 */
export async function signUp(t: AuthTest, email: string) {
  const result = await fromBrowser(t).mutation(api.auth.signUpWithEmailPassword, {
    email,
    password: TEST_PASSWORD,
  });
  if (!result.success) {
    throw new Error(`Sign-up failed: ${JSON.stringify(result.userError)}`);
  }
  return result.browserSecret;
}

/** The `code` of the newest link the stubbed Resend sent to `email`. */
export async function emailedCode(t: AuthTest, email: string) {
  const emails = await sentEmails(t as unknown as Parameters<typeof sentEmails>[0]);
  const latest = emails.filter((message) => message.to.includes(email)).at(-1);
  const link = latest?.text?.match(/https?:\/\/\S+/)?.[0];
  const code = link === undefined ? null : new URL(link).searchParams.get("code");
  if (code === null) throw new Error(`No emailed link was sent to ${email}`);
  return code;
}

/**
 * Sign up `email` and complete the sign-up with the code from the emailed
 * link, as a user who opens it in the same browser would. Returns the new
 * user's id and an accessor that calls functions as their session.
 */
export async function signedInUser(t: AuthTest, email: string) {
  const browserSecret = await signUp(t, email);
  const result = await fromBrowser(t).mutation(
    api.auth.completeSignUpWithEmailPassword,
    { emailCode: await emailedCode(t, email), browserSecret },
  );
  if (result.status !== "complete") {
    throw new Error(`Completing sign-up failed: ${JSON.stringify(result.userError)}`);
  }
  return {
    userId: result.tokens.userId as Id<"users">,
    as: t.withIdentity(sessionIdentity(result.tokens)),
  };
}
