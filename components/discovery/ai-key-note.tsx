import Link from "next/link";
import { cn } from "@/lib/utils";

export const AI_SETTINGS_HREF = "/app/settings#ai-provider";

/**
 * A short note for users with no AI key. Imports still start: a page with
 * complete recipe data needs no AI, and any other page fails with a clear
 * message.
 */
export function AiKeyNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Without an AI key, only pages that publish complete recipe data can be imported.{" "}
      <Link className="font-bold text-primary underline" href={AI_SETTINGS_HREF}>Add one in Settings.</Link>
    </p>
  );
}
