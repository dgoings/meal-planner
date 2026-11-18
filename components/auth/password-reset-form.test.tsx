import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordResetForm } from "./password-reset-form";

const mocks = vi.hoisted(() => ({
  startPasswordRecovery: vi.fn(),
}));

vi.mock("@convex-dev/auth/methods/email-password/react", () => ({
  useStartPasswordRecovery: () => ({
    startPasswordRecovery: mocks.startPasswordRecovery,
    pending: false,
  }),
}));

async function requestLink(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests a reset link and tells the user to check their email", async () => {
    mocks.startPasswordRecovery.mockResolvedValue({ success: true, sentTo: "cook@example.com" });
    render(<PasswordResetForm />);

    await requestLink(" Cook@Example.com ");

    expect(mocks.startPasswordRecovery).toHaveBeenCalledWith({ email: "cook@example.com" });
    expect(screen.getByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/cook@example\.com/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("gives the same answer when no account uses the address", async () => {
    mocks.startPasswordRecovery.mockResolvedValue({
      success: false,
      userError: { error: "EMAIL_NOT_FOUND" },
    });
    render(<PasswordResetForm />);

    await requestLink("nobody@example.com");

    expect(screen.getByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/nobody@example\.com/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    [{ error: "RATE_LIMITED", retryAfterMs: 60_000 }, "Too many attempts"],
    [{ error: "INVALID_EMAIL" }, "Check your email address"],
    [{ error: "OTHER_ERROR", cause: new Error("internal detail") }, "Couldn’t send a reset link"],
  ])("shows %o and stays on the form", async (userError, title) => {
    mocks.startPasswordRecovery.mockResolvedValue({ success: false, userError });
    render(<PasswordResetForm />);

    await requestLink("cook@example.com");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).not.toHaveTextContent("internal detail");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});
