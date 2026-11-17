/** An error to show the user: a short title and a sentence on what to do. */
export type AuthErrorMessage = {
  title: string;
  description: string;
};

/**
 * The `userError` codes that Convex Auth's email-password hooks return, plus
 * `OTHER_ERROR`, which the hooks use when the call itself threw.
 */
export type AuthUserError =
  | { error: "INVALID_EMAIL" }
  | { error: "EMAIL_TAKEN" }
  | { error: "EMAIL_NOT_FOUND" }
  | { error: "USER_NOT_FOUND" }
  | { error: "INVALID_CREDENTIALS" }
  | { error: "RATE_LIMITED"; retryAfterMs: number }
  | { error: "PASSWORD_TOO_SHORT"; minimumLength: number }
  | { error: "PASSWORD_TOO_LONG"; maximumLength: number }
  | { error: "PASSWORD_HAS_SURROUNDING_WHITESPACE" }
  | { error: "PASSWORD_TOO_COMMON" }
  | { error: "OTHER_ERROR"; cause: unknown };

export const NO_VERIFIED_ACCOUNT_MESSAGE =
  "No verified account for that email. Check your inbox for the confirmation link, or sign up again.";

const PASSWORD_TITLE = "Password doesn’t meet the requirements";

function isNetworkError(cause: unknown) {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network error")
  );
}

/**
 * Maps a `userError` to a message. `fallbackTitle` names the action that
 * failed, for errors with nothing more specific to say. Unexpected errors
 * never reveal their details.
 */
export function authErrorMessage(
  userError: AuthUserError,
  fallbackTitle: string,
): AuthErrorMessage {
  switch (userError.error) {
    case "INVALID_EMAIL":
      return {
        title: "Check your email address",
        description: "That doesn’t look like a valid email address.",
      };
    case "EMAIL_TAKEN":
      return {
        title: "Account already exists",
        description:
          "An account with this email already exists. Sign in instead, or use a different email.",
      };
    case "EMAIL_NOT_FOUND":
    case "USER_NOT_FOUND":
      return { title: "Account not found", description: NO_VERIFIED_ACCOUNT_MESSAGE };
    case "INVALID_CREDENTIALS":
      return {
        title: "Email or password is incorrect",
        description: "Check your email and password, then try again.",
      };
    case "RATE_LIMITED":
      return {
        title: "Too many attempts",
        description: "Wait a little while, then try again.",
      };
    case "PASSWORD_TOO_SHORT":
      return {
        title: PASSWORD_TITLE,
        description: `Choose a password with at least ${userError.minimumLength} characters.`,
      };
    case "PASSWORD_TOO_LONG":
      return {
        title: PASSWORD_TITLE,
        description: `Choose a password with at most ${userError.maximumLength} characters.`,
      };
    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
      return {
        title: PASSWORD_TITLE,
        description: "Remove the spaces at the start or end of the password.",
      };
    case "PASSWORD_TOO_COMMON":
      return {
        title: PASSWORD_TITLE,
        description: "That password is too common. Choose one that’s harder to guess.",
      };
    case "OTHER_ERROR":
      if (isNetworkError(userError.cause)) {
        return {
          title: "Connection problem",
          description: "Check your internet connection and try again.",
        };
      }
      return {
        title: fallbackTitle,
        description: "We couldn’t complete that request. Please try again.",
      };
  }
}
