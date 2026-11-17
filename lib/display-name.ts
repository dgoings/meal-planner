/**
 * The name to greet a user by. Sign-up no longer asks for a name, so this
 * falls back to the part of the email address before the `@`.
 */
export function displayName(
  user: { name?: string; email?: string } | null | undefined,
): string {
  const name = user?.name?.trim();
  if (name) return name;
  const localPart = user?.email?.split("@")[0]?.trim();
  if (localPart) return localPart;
  return "there";
}
