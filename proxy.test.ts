// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Run the app's handler directly: the 2.0 wrapper only refreshes cookies
// around it, and needs a live deployment to do so.
vi.mock("@/lib/convex-auth", () => ({
  convexAuthNextjsProxy: (handler: unknown) => handler,
  nextjsProxyRedirect: (request: NextRequest, path: string) =>
    NextResponse.redirect(new URL(path, request.url)),
}));

const { default: proxy, config } = await import("./proxy");

type Handler = (
  request: NextRequest,
  ctx: { isAuthenticated: () => Promise<boolean>; getToken: () => Promise<string | null> },
) => Promise<NextResponse | undefined | void>;

async function visit(path: string, signedIn: boolean) {
  const handler = proxy as unknown as Handler;
  const response = await handler(new NextRequest(`http://localhost:3000${path}`), {
    isAuthenticated: async () => signedIn,
    getToken: async () => null,
  });
  return response ? response.headers.get("location") : null;
}

describe("proxy redirects", () => {
  it.each(["/app", "/app/x", "/app/recipes/1?tab=notes"])(
    "sends a signed-out visitor from %s to sign-in with the destination",
    async (path) => {
      expect(await visit(path, false)).toBe(
        `http://localhost:3000/sign-in?next=${encodeURIComponent(path)}`,
      );
    },
  );

  it("lets a signed-in user into the app", async () => {
    expect(await visit("/app/x", true)).toBeNull();
  });

  it("does not treat /apps as an app route", async () => {
    expect(await visit("/apps", false)).toBeNull();
  });

  it.each(["/sign-in", "/sign-up"])("sends a signed-in user from %s to the app", async (path) => {
    expect(await visit(path, true)).toBe("http://localhost:3000/app");
    expect(await visit(path, false)).toBeNull();
  });

  it.each(["/validate-email", "/reset-password", "/confirm-email-change"])(
    "neither protects nor redirects the link landing page %s",
    async (path) => {
      expect(await visit(`${path}?code=abc`, false)).toBeNull();
      expect(await visit(`${path}?code=abc`, true)).toBeNull();
    },
  );
});

describe("proxy matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("excludes the auth route handlers", () => {
    expect(matcher.test("/auth/signin")).toBe(false);
    expect(matcher.test("/auth/refresh")).toBe(false);
    expect(matcher.test("/auth/signout")).toBe(false);
  });

  it("runs on pages, including the link landing pages", () => {
    for (const path of ["/app", "/sign-in", "/validate-email", "/reset-password", "/confirm-email-change"]) {
      expect(matcher.test(path)).toBe(true);
    }
  });
});
