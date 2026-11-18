import { ConvexError } from "convex/values";
import { aiErrorCodeIn, type AiErrorCode } from "@/convex/lib/aiErrorCodes";

/** What each AI failure means for the user, wherever it is shown. */
export const AI_ERROR_COPY: Record<AiErrorCode, string> = {
  ai_key_missing: "Add an AI key in Settings to import this recipe, then choose Try again.",
  ai_key_unreadable: "Your saved AI key can no longer be read. Paste it again in Settings, then try again.",
  ai_not_configured: "AI features aren’t available on this PerfectPlate deployment right now. Contact the person who runs it.",
  ai_key_invalid: "Your AI provider rejected your key. Update it in Settings, then try again.",
  ai_key_no_credit: "Your AI provider account is out of credit or over its spending limit. Add credit with your provider, then try again.",
  ai_rate_limited: "Your AI provider is limiting requests right now. Wait a minute, then try again.",
  ai_model_not_found: "Your AI provider doesn’t recognise the model in Settings. Check the model name, then try again.",
  ai_model_no_structured_output: "The model in Settings can’t return structured recipe data. Choose a different model, then try again.",
  ai_model_required: "Enter a model in Settings, then try again.",
  ai_model_invalid: "That model name doesn’t look right. For OpenRouter use vendor/model.",
  ai_key_malformed: "That doesn’t look like an API key.",
  ai_provider_unreachable: "We couldn’t reach your AI provider. Try again.",
  ai_provider_error: "Your AI provider couldn’t complete the request. Check your provider account, then try again.",
};

export function recipeImportFailureMessage(errorMessage: string | undefined) {
  const aiCode = aiErrorCodeIn(errorMessage);
  if (aiCode !== undefined) return AI_ERROR_COPY[aiCode];
  if (errorMessage?.includes("did not find a complete recipe")) {
    return "We couldn’t read a complete recipe from that page.";
  }
  if (errorMessage?.includes("recipe_scrape_failed")) {
    return "We couldn’t scrape a complete recipe from that website.";
  }
  return "We couldn’t read a complete recipe from that page.";
}

/** The `code` a Convex function put in a `ConvexError`, if any. */
export function convexErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const code = (error.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Codes meaning the user has no usable AI key right now. */
export function isMissingKeyCode(code: string | undefined) {
  return code === "ai_key_missing" || code === "ai_key_unreadable" || code === "ai_not_configured";
}

/** Why a retry was refused for lack of a usable key, or undefined for other refusals. */
export function retryFailureMessage(error: unknown) {
  const code = convexErrorCode(error);
  if (!isMissingKeyCode(code)) return undefined;
  return code === "ai_not_configured"
    ? AI_ERROR_COPY.ai_not_configured
    : "Add an AI key in Settings, then try again.";
}
