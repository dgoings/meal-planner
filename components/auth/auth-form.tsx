"use client";

import { DEFAULT_MIN_PASSWORD_LENGTH } from "@convex-dev/auth/methods/email-password";
import {
  useSignInWithEmailPassword,
  useSignUpWithEmailPassword,
} from "@convex-dev/auth/methods/email-password/react";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { safeAppRedirect } from "@/lib/navigation";
import { authErrorMessage, type AuthErrorMessage } from "./auth-error-message";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { signIn } = useSignInWithEmailPassword(api.auth);
  const { signUp } = useSignUpWithEmailPassword(api.auth);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The address a confirmation link was sent to, once sign-up succeeds.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (isSignUp) {
      const result = await signUp({ email, password });
      if (result.success) {
        setSentTo(email);
      } else {
        setError(authErrorMessage(result.userError, "Couldn’t create your account"));
      }
      setIsSubmitting(false);
      return;
    }

    const result = await signIn({ email, password });
    if (result.status === "complete") {
      router.replace(safeAppRedirect(searchParams.get("next")));
      router.refresh();
      return;
    }
    setError(authErrorMessage(result.userError, "Couldn’t sign you in"));
    setIsSubmitting(false);
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow eyebrow-on-primary">Your recipes, ready when you are</p>
          <p className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Turn recipe clutter into a calm plan for dinner.
          </p>
          <ul className="mt-8 grid gap-4 text-sm text-white/80">
            {["Email recipe links straight to your book", "Find ideas from ingredients and cravings", "Build one tidy, editable grocery list"].map((item) => (
              <li className="flex gap-3" key={item}>
                <CheckCircle2 className="mt-px shrink-0" size={19} />{item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white">Secure account access powered by Convex Auth.</p>
      </section>

      <section className="auth-panel">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="eyebrow">Welcome {isSignUp ? "to PerfectPlate" : "back"}</p>
          <h1 className="font-display text-4xl font-semibold">
            {sentTo !== null ? "Check your email" : isSignUp ? "Create your account" : "Sign in to your kitchen"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {sentTo !== null
              ? `We sent a confirmation link to ${sentTo}. Open it in this browser to finish creating your account.`
              : isSignUp ? "Save inspiration, simplify shopping, and keep dinner moving." : "Pick up where you left off."}
          </p>

          {error && (
            <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.description}</AlertDescription>
            </Alert>
          )}

          {sentTo !== null ? (
            <div className="mt-8 grid gap-4">
              <p className="text-sm leading-6 text-muted-foreground">
                The link expires soon. If it doesn’t arrive, check your spam folder, or sign up again to get a new link.
              </p>
              <button
                className="justify-self-start text-sm font-bold text-primary underline underline-offset-4"
                type="button"
                onClick={() => setSentTo(null)}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
                <label className="grid gap-2 text-sm font-bold">
                  Email
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                    <Input className="auth-input-with-icon" required name="email" type="email" autoComplete="email" placeholder="you@example.com" />
                  </div>
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Password
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                    <Input
                      className="auth-input-with-icon"
                      required
                      minLength={isSignUp ? DEFAULT_MIN_PASSWORD_LENGTH : undefined}
                      name="password"
                      type="password"
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      placeholder={isSignUp ? `At least ${DEFAULT_MIN_PASSWORD_LENGTH} characters` : "Your password"}
                    />
                  </div>
                </label>
                {!isSignUp && (
                  <Link className="justify-self-end text-sm font-bold text-primary underline underline-offset-4" href="/forgot-password">
                    Forgot your password?
                  </Link>
                )}
                <Button disabled={isSubmitting} type="submit" size="lg" className="mt-2">
                  {isSubmitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
                  {!isSubmitting && <ArrowRight size={17} />}
                </Button>
              </form>

              <p className="mt-6 text-sm text-muted-foreground">
                {isSignUp ? "Already have an account?" : "New to PerfectPlate?"}{" "}
                <Link className="font-bold text-primary underline underline-offset-4" href={isSignUp ? "/sign-in" : "/sign-up"}>
                  {isSignUp ? "Sign in" : "Create an account"}
                </Link>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
