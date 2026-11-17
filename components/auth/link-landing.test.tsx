import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName, type FunctionReference } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfirmEmailChangeLanding,
  ResetPasswordLanding,
  ValidateEmailLanding,
} from "./link-landing";

const mocks = vi.hoisted(() => ({
  code: "link-code" as string | null,
  replace: vi.fn(),
  refresh: vi.fn(),
  completeSignUp: vi.fn(),
  completePasswordRecovery: vi.fn(),
  completeChangeEmail: vi.fn(),
  completePasswordRecoveryCall: vi.fn(),
}));

vi.mock("@convex-dev/auth/methods/email-password/react", () => ({
  useCompleteSignUpWithEmailPassword: mocks.completeSignUp,
  useCompletePasswordRecovery: mocks.completePasswordRecovery,
  useCompleteChangeEmail: mocks.completeChangeEmail,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
  useSearchParams: () =>
    new URLSearchParams(mocks.code === null ? {} : { code: mocks.code }),
}));

const UNUSABLE = "This link can't be used here.";

function expectUnusableLink(linkName: string, href: string) {
  expect(screen.getByRole("heading", { name: UNUSABLE })).toBeInTheDocument();
  expect(screen.getByText(/only work in the browser that requested them/i)).toBeInTheDocument();
  expect(screen.getByText(/expire/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: linkName })).toHaveAttribute("href", href);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.code = "link-code";
});

describe("ValidateEmailLanding", () => {
  it("presents the code from the link and enters the app once complete", () => {
    mocks.completeSignUp.mockReturnValue({ status: "complete" });
    render(<ValidateEmailLanding />);

    expect(mocks.completeSignUp).toHaveBeenCalledWith(expect.anything(), {
      emailCode: "link-code",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/app");
  });

  it("shows progress while the link is checked", () => {
    mocks.completeSignUp.mockReturnValue({ status: "loading" });
    render(<ValidateEmailLanding />);

    expect(screen.getByRole("heading", { name: "Confirming your email…" })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["opened in another browser", { error: "MISSING_SECRET" }],
    ["expired or already used", { error: "INVALID_CHALLENGE" }],
    ["not the newest link", { error: "INCORRECT_CODE" }],
    ["unexpected failure", { error: "OTHER_ERROR", cause: new Error("boom") }],
  ])("offers to sign up again when the link was %s", (_case, userError) => {
    mocks.completeSignUp.mockReturnValue({ status: "error", userError });
    render(<ValidateEmailLanding />);

    expectUnusableLink("Sign up again", "/sign-up");
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("offers to sign up again when the URL has no code", () => {
    mocks.code = null;
    render(<ValidateEmailLanding />);

    expectUnusableLink("Sign up again", "/sign-up");
    expect(mocks.completeSignUp).not.toHaveBeenCalled();
  });
});

describe("ResetPasswordLanding", () => {
  beforeEach(() => {
    mocks.completePasswordRecovery.mockReturnValue({
      status: "ready",
      pending: false,
      completePasswordRecovery: mocks.completePasswordRecoveryCall,
    });
  });

  it("asks for a new password, sets it, and enters the app", async () => {
    mocks.completePasswordRecoveryCall.mockResolvedValue({
      status: "complete",
      tokens: { token: "jwt" },
    });
    const user = userEvent.setup();
    render(<ResetPasswordLanding />);

    expect(mocks.completePasswordRecovery).toHaveBeenCalledWith(expect.anything(), {
      emailCode: "link-code",
    });
    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(mocks.completePasswordRecoveryCall).toHaveBeenCalledWith({
      newPassword: "a-new-password",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/app");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows a password error inline and keeps the form", async () => {
    mocks.completePasswordRecoveryCall.mockResolvedValue({
      status: "error",
      userError: { error: "PASSWORD_TOO_SHORT", minimumLength: 10 },
    });
    const user = userEvent.setup();
    render(<ResetPasswordLanding />);

    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a password with at least 10 characters.",
    );
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("leaves a link error to the hook instead of showing it as a password error", async () => {
    mocks.completePasswordRecoveryCall.mockResolvedValue({
      status: "error",
      userError: { error: "INVALID_CHALLENGE" },
    });
    const user = userEvent.setup();
    render(<ResetPasswordLanding />);

    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not ask for a password while the link is checked", () => {
    mocks.completePasswordRecovery.mockReturnValue({ status: "loading" });
    render(<ResetPasswordLanding />);

    expect(screen.getByRole("heading", { name: "Checking your link…" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("enters the app once the hook reports completion", () => {
    mocks.completePasswordRecovery.mockReturnValue({ status: "complete" });
    render(<ResetPasswordLanding />);

    expect(mocks.replace).toHaveBeenCalledWith("/app");
  });

  it.each([
    ["opened in another browser", { error: "MISSING_SECRET" }],
    ["expired or already used", { error: "INVALID_CHALLENGE" }],
    ["not the newest link", { error: "INCORRECT_CODE" }],
  ])("offers a new link when the link was %s", (_case, userError) => {
    mocks.completePasswordRecovery.mockReturnValue({ status: "error", userError });
    render(<ResetPasswordLanding />);

    expectUnusableLink("Request a new link", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("offers a new link when the URL has no code", () => {
    mocks.code = null;
    render(<ResetPasswordLanding />);

    expectUnusableLink("Request a new link", "/forgot-password");
    expect(mocks.completePasswordRecovery).not.toHaveBeenCalled();
  });
});

describe("ConfirmEmailChangeLanding", () => {
  it("completes the change through the app's wrapper, which refreshes the user's email", () => {
    mocks.completeChangeEmail.mockReturnValue({ status: "loading" });
    render(<ConfirmEmailChangeLanding />);

    const [authApi, args] = mocks.completeChangeEmail.mock.calls[0] as [
      { completeChangeEmail: FunctionReference<"mutation"> },
      { emailCode: string },
    ];
    expect(getFunctionName(authApi.completeChangeEmail)).toBe("auth:completeChangeEmail");
    expect(args).toEqual({ emailCode: "link-code" });
  });

  it("confirms the update and links back to settings", () => {
    mocks.completeChangeEmail.mockReturnValue({ status: "complete" });
    render(<ConfirmEmailChangeLanding />);

    expect(screen.getByText("Your email address has been updated.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to settings" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
  });

  it("explains an unusable link", () => {
    mocks.completeChangeEmail.mockReturnValue({
      status: "error",
      userError: { error: "MISSING_SECRET" },
    });
    render(<ConfirmEmailChangeLanding />);

    expectUnusableLink("Go to settings", "/app/settings");
  });

  it("asks a signed-out user to sign in and come back to the same link", () => {
    mocks.code = "abc/123";
    mocks.completeChangeEmail.mockReturnValue({
      status: "error",
      userError: { error: "NOT_LOGGED_IN" },
    });
    render(<ConfirmEmailChangeLanding />);

    expect(screen.getByText(/sign in to the account that asked for the change, then open the link again/i))
      .toBeInTheDocument();
    expect(screen.queryByText(/only work in the browser that requested them/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent("/confirm-email-change?code=abc%2F123")}`,
    );
  });
});
