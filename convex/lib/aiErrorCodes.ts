/**
 * Stable codes for failures caused by a user's AI settings or provider
 * account. They are stored on imports and sent in `ConvexError` data, and the
 * client maps each to its own copy. This module has no dependencies so the
 * browser bundle can import it.
 */
export const AI_ERROR_CODES = [
  "ai_key_missing",
  "ai_key_unreadable",
  "ai_not_configured",
  "ai_key_invalid",
  "ai_key_no_credit",
  "ai_rate_limited",
  "ai_model_not_found",
  "ai_model_no_structured_output",
  "ai_model_required",
  "ai_model_invalid",
  "ai_key_malformed",
  "ai_provider_unreachable",
  "ai_provider_error",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && (AI_ERROR_CODES as readonly string[]).includes(value);
}

/** The first known code that appears as a whole word in `message`. */
export function aiErrorCodeIn(message: string | undefined): AiErrorCode | undefined {
  if (message === undefined) return undefined;
  for (const match of message.matchAll(/\bai_[a-z_]+\b/g)) {
    if (isAiErrorCode(match[0])) return match[0];
  }
  return undefined;
}
