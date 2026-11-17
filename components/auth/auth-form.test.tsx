import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  next: "/app/imports" as string | null,
}));

vi.mock("@convex-dev/auth/methods/email-password/react", () => ({
  useSignInWithEmailPassword: () => ({ signIn: mocks.signIn, pending: false }),
  useSignUpWithEmailPassword: () => ({ signUp: mocks.signUp, pending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () =>
    new URLSearchParams(mocks.next === null ? {} : { next: mocks.next }),
}));

async function submitSignIn(email = "cook@example.com", password = "password123") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

async function submitSignUp(email = "cook@example.com", password = "a-long-password") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("AuthForm sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.next = "/app/imports";
  });

  it("signs in and honors a safe destination", async () => {
    mocks.signIn.mockResolvedValue({ status: "complete", tokens: { token: "jwt" } });
    render(<AuthForm mode="sign-in" />);

    await submitSignIn(" Cook@Example.com ");

    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "cook@example.com",
      password: "password123",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/app/imports");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("goes to /app when there is no destination", async () => {
    mocks.next = null;
    mocks.signIn.mockResolvedValue({ status: "complete", tokens: { token: "jwt" } });
    render(<AuthForm mode="sign-in" />);

    await submitSignIn();

    expect(mocks.replace).toHaveBeenCalledWith("/app");
  });

  it("ignores a destination outside the app", async () => {
    mocks.next = "https://evil.example/app";
    mocks.signIn.mockResolvedValue({ status: "complete", tokens: { token: "jwt" } });
    render(<AuthForm mode="sign-in" />);

    await submitSignIn();

    expect(mocks.replace).toHaveBeenCalledWith("/app");
  });

  it("reserves space for the email and password field icons", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByLabelText("Email")).toHaveClass("auth-input-with-icon");
    expect(screen.getByLabelText("Password")).toHaveClass("auth-input-with-icon");
  });

  it("links sign-in users to password recovery", () => {
    render(<AuthForm mode="sign-in" />);

    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("tells an unknown or unconfirmed account to use its link or sign up again", async () => {
    mocks.signIn.mockResolvedValue({ status: "error", userError: { error: "USER_NOT_FOUND" } });
    render(<AuthForm mode="sign-in" />);

    await submitSignIn();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No verified account for that email. Check your inbox for the confirmation link, or sign up again.",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it.each([
    [
      { error: "INVALID_CREDENTIALS" },
      "Email or password is incorrect",
      "Check your email and password, then try again.",
    ],
    [
      { error: "RATE_LIMITED", retryAfterMs: 60_000 },
      "Too many attempts",
      "Wait a little while, then try again.",
    ],
    [
      { error: "OTHER_ERROR", cause: new Error("internal deployment detail") },
      "Couldn’t sign you in",
      "We couldn’t complete that request. Please try again.",
    ],
    [
      { error: "OTHER_ERROR", cause: new TypeError("Failed to fetch") },
      "Connection problem",
      "Check your internet connection and try again.",
    ],
  ])("shows a specific message for %o", async (userError, title, description) => {
    mocks.signIn.mockResolvedValue({ status: "error", userError });
    render(<AuthForm mode="sign-in" />);

    await submitSignIn();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(description);
    expect(alert).not.toHaveTextContent("internal deployment detail");
  });
});

describe("AuthForm sign-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.next = "/app/imports";
  });

  it("asks only for an email and a password", () => {
    render(<AuthForm mode="sign-up" />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("tells the user to check their email for the confirmation link", async () => {
    mocks.signUp.mockResolvedValue({ success: true });
    render(<AuthForm mode="sign-up" />);

    await submitSignUp("Cook@Example.com");

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "cook@example.com",
      password: "a-long-password",
    });
    expect(screen.getByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/cook@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/in this browser/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each([
    [
      { error: "EMAIL_TAKEN" },
      "Account already exists",
      "An account with this email already exists. Sign in instead, or use a different email.",
    ],
    [
      { error: "PASSWORD_TOO_SHORT", minimumLength: 10 },
      "Password doesn’t meet the requirements",
      "Choose a password with at least 10 characters.",
    ],
    [
      { error: "PASSWORD_TOO_COMMON" },
      "Password doesn’t meet the requirements",
      "That password is too common. Choose one that’s harder to guess.",
    ],
    [
      { error: "INVALID_EMAIL" },
      "Check your email address",
      "That doesn’t look like a valid email address.",
    ],
    [
      { error: "OTHER_ERROR", cause: new Error("boom") },
      "Couldn’t create your account",
      "We couldn’t complete that request. Please try again.",
    ],
  ])("shows %o and stays on the form", async (userError, title, description) => {
    mocks.signUp.mockResolvedValue({ success: false, userError });
    render(<AuthForm mode="sign-up" />);

    await submitSignUp();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(description);
    expect(screen.queryByRole("heading", { name: "Check your email" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });
});
