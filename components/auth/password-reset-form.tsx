"use client";

import { useStartPasswordRecovery } from "@convex-dev/auth/methods/email-password/react";
import { ArrowLeft, ArrowRight, CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { authErrorMessage, type AuthErrorMessage } from "./auth-error-message";

export function PasswordResetForm() {
  const { startPasswordRecovery } = useStartPasswordRecovery(api.auth);
  // The address a reset link was requested for, once the request is done.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    const result = await startPasswordRecovery({ email });
    // An unknown address gets the same answer as a known one, so the form
    // does not reveal which addresses have accounts. The typed address is
    // shown in both cases for the same reason.
    if (result.success || result.userError.error === "EMAIL_NOT_FOUND") {
      setSentTo(email);
    } else {
      setError(authErrorMessage(result.userError, "Couldn’t send a reset link"));
    }
    setIsSubmitting(false);
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow eyebrow-on-primary">Account recovery</p>
          <p className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Get back to your recipes and dinner plans.
          </p>
          <ul className="mt-8 grid gap-4 text-sm text-white/80">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-px shrink-0" size={19} />
              Reset securely with a link sent to your email
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-px shrink-0" size={19} />
              Keep your saved recipes and grocery lists
            </li>
          </ul>
        </div>
        <p className="text-xs text-white">Secure account access powered by Convex Auth.</p>
      </section>

      <section className="auth-panel">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="eyebrow">Reset your password</p>
          <h1 className="font-display text-4xl font-semibold">
            {sentTo === null ? "Find your account" : "Check your email"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {sentTo === null
              ? "Enter the email address you use for PerfectPlate."
              : `If ${sentTo} has a PerfectPlate account, we sent it a link to choose a new password. Open it in this browser.`}
          </p>

          {error && (
            <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.description}</AlertDescription>
            </Alert>
          )}

          {sentTo === null ? (
            <form className="mt-8 grid gap-4" onSubmit={requestLink}>
              <label className="grid gap-2 text-sm font-bold">
                Email
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                  <Input className="auth-input-with-icon" required name="email" type="email" autoComplete="email" placeholder="you@example.com" />
                </div>
              </label>
              <Button disabled={isSubmitting} type="submit" size="lg" className="mt-2">
                {isSubmitting ? "Sending link…" : "Send reset link"}
                {!isSubmitting && <ArrowRight size={17} />}
              </Button>
            </form>
          ) : (
            <div className="mt-8 grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                The link expires soon. If it doesn’t arrive, check your spam folder or request a new link.
              </p>
              <button
                className="justify-self-start text-sm font-bold text-primary underline underline-offset-4"
                type="button"
                onClick={() => setSentTo(null)}
              >
                Use a different email
              </button>
            </div>
          )}

          <Link className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary underline underline-offset-4" href="/sign-in">
            <ArrowLeft size={16} /> Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
