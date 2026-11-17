"use client";

import { DEFAULT_MIN_PASSWORD_LENGTH } from "@convex-dev/auth/methods/email-password";
import {
  useCompleteChangeEmail,
  useCompletePasswordRecovery,
  useCompleteSignUpWithEmailPassword,
} from "@convex-dev/auth/methods/email-password/react";
import { ArrowRight, CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { safeAppRedirect } from "@/lib/navigation";
import { authErrorMessage, type AuthErrorMessage } from "./auth-error-message";

// The landing pages of the emailed links. Each link carries a `code`, and
// completes only in the browser that started its flow, which keeps a secret
// for it. A link from another browser, an expired link, and a used link all
// end the same way: an explanation and the way to get a new link.

function LandingShell({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className="auth-layout">
      <section className="auth-story">
        <Brand />
        <p className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
          Turn recipe clutter into a calm plan for dinner.
        </p>
        <p className="text-xs text-white">Secure account access powered by Convex Auth.</p>
      </section>
      <section className="auth-panel">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="eyebrow">{eyebrow}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function Checking({ title }: { title: string }) {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold">{title}</h1>
      <p className="mt-3 flex items-center gap-2 text-sm leading-6 text-muted-foreground" role="status">
        <LoaderCircle className="animate-spin" size={16} aria-hidden />
        This only takes a moment.
      </p>
    </>
  );
}

function UnusableLink({ action }: { action: { href: string; label: string } }) {
  return (
    <>
      <h1 className="font-display text-4xl font-semibold">This link can&apos;t be used here.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Email links only work in the browser that requested them, and they expire after a
        short time or once they have been used.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href={action.href}>
          {action.label}
          <ArrowRight size={17} />
        </Link>
      </Button>
    </>
  );
}

/** Navigates into the app once, however many times it is called. */
function useEnterApp() {
  const router = useRouter();
  const entered = useRef(false);
  return useCallback(() => {
    if (entered.current) return;
    entered.current = true;
    router.replace("/app");
    router.refresh();
  }, [router]);
}

function useLinkCode() {
  return useSearchParams().get("code");
}

const SIGN_UP_AGAIN = { href: "/sign-up", label: "Sign up again" };
const REQUEST_NEW_LINK = { href: "/forgot-password", label: "Request a new link" };
const GO_TO_SETTINGS = { href: "/app/settings", label: "Go to settings" };

export function ValidateEmailLanding() {
  const code = useLinkCode();
  return (
    <LandingShell eyebrow="Confirm your email">
      {code === null ? <UnusableLink action={SIGN_UP_AGAIN} /> : <ValidateEmail emailCode={code} />}
    </LandingShell>
  );
}

function ValidateEmail({ emailCode }: { emailCode: string }) {
  const state = useCompleteSignUpWithEmailPassword(api.auth, { emailCode });
  const enterApp = useEnterApp();

  useEffect(() => {
    if (state.status === "complete") enterApp();
  }, [state.status, enterApp]);

  if (state.status === "error") return <UnusableLink action={SIGN_UP_AGAIN} />;
  return <Checking title={state.status === "complete" ? "Email confirmed" : "Confirming your email…"} />;
}

export function ResetPasswordLanding() {
  const code = useLinkCode();
  return (
    <LandingShell eyebrow="Reset your password">
      {code === null ? <UnusableLink action={REQUEST_NEW_LINK} /> : <ResetPassword emailCode={code} />}
    </LandingShell>
  );
}

function ResetPassword({ emailCode }: { emailCode: string }) {
  const state = useCompletePasswordRecovery(api.auth, { emailCode });
  const enterApp = useEnterApp();
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (state.status === "complete") enterApp();
  }, [state.status, enterApp]);

  if (state.status === "error") return <UnusableLink action={REQUEST_NEW_LINK} />;
  if (state.status !== "ready") {
    return <Checking title={state.status === "complete" ? "Password updated" : "Checking your link…"} />;
  }

  const { completePasswordRecovery } = state;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const newPassword = String(new FormData(event.currentTarget).get("newPassword") ?? "");

    const result = await completePasswordRecovery({ newPassword });
    if (result.status === "complete") {
      enterApp();
      return;
    }
    setIsSubmitting(false);
    const { userError } = result;
    // Errors about the link itself move the hook to its error state, which
    // replaces the form; the rest are about the new password.
    if (userError.error === "INVALID_CHALLENGE" || userError.error === "INCORRECT_CODE") return;
    setError(authErrorMessage(userError, "Couldn’t reset your password"));
  }

  return (
    <>
      <h1 className="font-display text-4xl font-semibold">Choose a new password</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        You’ll be signed in as soon as it’s saved.
      </p>

      {error && (
        <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.description}</AlertDescription>
        </Alert>
      )}

      <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-bold">
          New password
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
            <Input
              className="auth-input-with-icon"
              required
              autoFocus
              name="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder={`At least ${DEFAULT_MIN_PASSWORD_LENGTH} characters`}
            />
          </div>
        </label>
        <Button disabled={isSubmitting || state.pending} type="submit" size="lg" className="mt-2">
          {isSubmitting ? "Saving…" : "Set new password"}
          {!isSubmitting && <ArrowRight size={17} />}
        </Button>
      </form>
    </>
  );
}

export function ConfirmEmailChangeLanding() {
  const code = useLinkCode();
  return (
    <LandingShell eyebrow="Change your email">
      {code === null ? <UnusableLink action={GO_TO_SETTINGS} /> : <ConfirmEmailChange emailCode={code} />}
    </LandingShell>
  );
}

function ConfirmEmailChange({ emailCode }: { emailCode: string }) {
  // `api.auth.completeChangeEmail` is the app's wrapper, which also updates
  // the address the app stores for the user.
  const state = useCompleteChangeEmail(api.auth, { emailCode });

  if (state.status === "error") {
    if (state.userError.error === "NOT_LOGGED_IN") return <SignInToConfirm emailCode={emailCode} />;
    return <UnusableLink action={GO_TO_SETTINGS} />;
  }
  if (state.status === "loading") return <Checking title="Confirming your new email…" />;
  return (
    <>
      <h1 className="flex items-center gap-3 font-display text-4xl font-semibold">
        <CheckCircle2 className="shrink-0 text-primary" size={32} aria-hidden />
        Email updated
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Your email address has been updated.</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/app/settings">
          Back to settings
          <ArrowRight size={17} />
        </Link>
      </Button>
    </>
  );
}

/**
 * The change needs the session of the account that asked for it. The
 * browser still holds the flow's secret, so after signing in the same link
 * works.
 */
function SignInToConfirm({ emailCode }: { emailCode: string }) {
  const next = safeAppRedirect(`/confirm-email-change?code=${encodeURIComponent(emailCode)}`);
  return (
    <>
      <h1 className="font-display text-4xl font-semibold">Sign in to confirm</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Sign in to the account that asked for the change, then open the link again.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>
          Sign in
          <ArrowRight size={17} />
        </Link>
      </Button>
    </>
  );
}
