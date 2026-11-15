import type { EmailProviderSendVerificationRequestParams } from "@auth/core/providers/email";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

async function sendCodeEmail(
  { identifier, token }: EmailProviderSendVerificationRequestParams,
  purpose: "password-reset" | "email-verification",
) {
  const copy =
    purpose === "password-reset"
      ? {
          subject: "Reset your PerfectPlate password",
          label: "password reset code",
          ignore: "If you did not request this, you can ignore this email.",
        }
      : {
          subject: "Confirm your PerfectPlate email address",
          label: "email confirmation code",
          ignore: "If you did not create a PerfectPlate account, you can ignore this email.",
        };
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY is not configured");
  }
  if (!inboxId) {
    throw new Error("AGENTMAIL_INBOX_ID is not configured");
  }

  // Account email runs in the parent Convex action rather than the isolated
  // AgentMail component so deployment secrets are available and a rejected
  // send is reported to the user immediately.
  const baseUrl = (process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0")
    .trim()
    .replace(/\/$/, "");
  const response = await fetch(
    `${baseUrl}/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: identifier,
        subject: copy.subject,
        text: `Your PerfectPlate ${copy.label} is ${token}. It expires in 15 minutes. ${copy.ignore}`,
        html: `<p>Your PerfectPlate ${copy.label} is:</p><p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em;">${token}</p><p>This code expires in 15 minutes. ${copy.ignore}</p>`,
        labels: [purpose],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`AgentMail rejected the ${purpose} email (${response.status})`);
  }
}

async function generateSixDigitCode() {
  // Rejection sampling avoids modulo bias while keeping the code easy to type.
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  const randomValue = new Uint32Array(1);
  do {
    crypto.getRandomValues(randomValue);
  } while (randomValue[0] >= limit);
  return String(randomValue[0] % 1_000_000).padStart(6, "0");
}

const passwordResetEmail = Email({
  id: "password-reset",
  maxAge: 15 * 60,
  generateVerificationToken: generateSixDigitCode,
  sendVerificationRequest: (params) => sendCodeEmail(params, "password-reset"),
});

const emailVerificationEmail = Email({
  id: "email-verification",
  maxAge: 15 * 60,
  generateVerificationToken: generateSixDigitCode,
  sendVerificationRequest: (params) =>
    sendCodeEmail(params, "email-verification"),
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: passwordResetEmail,
      verify: emailVerificationEmail,
      profile(params) {
        const email = params.email;
        if (typeof email !== "string") {
          throw new Error("Email is required");
        }

        return {
          email: email.trim().toLowerCase(),
          name: typeof params.name === "string" ? params.name.trim() : "",
        };
      },
    }),
  ],
});
