import { getAuthUserId } from "@convex-dev/auth/server";

export async function requireUser(ctx: Parameters<typeof getAuthUserId>[0]) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}
