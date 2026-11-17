const url = process.env.NEXT_PUBLIC_CONVEX_URL;

if (url === undefined) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}

/** The Convex deployment URL, shared by the server and the client. */
export const convexUrl: string = url;
