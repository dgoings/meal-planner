/**
 * The post-sign-in destination from a `next` parameter: an in-app path, or
 * the email-change confirmation link. Anything else falls back to `/app`.
 */
export function safeAppRedirect(value: string | null) {
  if (value === null) return "/app";
  try {
    const base = "https://perfectplate.local";
    const target = new URL(value, base);
    const isAppPath = target.pathname === "/app" || target.pathname.startsWith("/app/");
    // The email-change link needs a session, so sign-in may return to it.
    const isEmailChangeLink = target.pathname === "/confirm-email-change";
    if (target.origin !== base || !(isAppPath || isEmailChangeLink)) {
      return "/app";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/app";
  }
}
