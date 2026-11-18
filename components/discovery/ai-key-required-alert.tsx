import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AI_ERROR_COPY } from "@/lib/recipe-import-errors";

export const AI_SETTINGS_HREF = "/app/settings#ai-provider";

/** Shown when an import is refused because the user has no usable AI key. */
export function AiKeyRequiredAlert({ code }: { code: string | undefined }) {
  if (code === "ai_not_configured") {
    return (
      <Alert className="mt-3 border-red-200 bg-red-50" role="alert">
        <AlertTitle>Import unavailable</AlertTitle>
        <AlertDescription>{AI_ERROR_COPY.ai_not_configured}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="mt-3 border-red-200 bg-red-50" role="alert">
      <AlertTitle>Add an AI key to import recipes</AlertTitle>
      <AlertDescription>
        Recipe import runs on your own AI provider key. Add one in Settings, then paste the link again.
        {" "}
        <Link className="font-bold underline" href={AI_SETTINGS_HREF}>Go to Settings</Link>
      </AlertDescription>
    </Alert>
  );
}
