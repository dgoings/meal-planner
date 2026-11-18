import { APICallError } from "@ai-sdk/provider";
import type { AiErrorCode } from "./aiErrorCodes";

// Error shapes, from each provider's error documentation:
// - Anthropic: `{ type: "error", error: { type, message } }`. 401
//   authentication_error, 402 billing_error, 403 permission_error, 404
//   not_found_error, 429 rate_limit_error; a reached spend limit is a 400
//   invalid_request_error; 5xx and 529 are transient.
// - OpenAI: `{ error: { message, type, code, param } }`. 401 bad key; 403
//   unsupported region; 429 is a rate limit, or a billing stop with code
//   credit_balance_exhausted, *_spend_limit_exceeded,
//   organization_usage_limit_exceeded or type insufficient_quota.
// - OpenRouter: `{ error: { code, message, metadata } }`. 401 bad key, 402
//   insufficient credits, 403 moderation or guardrail, 404 missing model,
//   429 rate limit, 502/503 upstream trouble.
const STRUCTURED_OUTPUT =
  /response_format|json_schema|structured output|structured_outputs|No endpoints found that support/i;
const NO_CREDIT =
  /insufficient_quota|credit_balance|credit balance|spend_limit|spend limit|usage_limit|usage limit|billing|credits/i;
const UNKNOWN_MODEL = /not found|does not exist|invalid model|not a valid model/i;

/**
 * Maps a failed provider response to a code. Returns undefined for failures
 * that may succeed on a retry (timeouts and server errors).
 */
export function classifyProviderResponse(
  status: number,
  body: string,
): AiErrorCode | undefined {
  if ((status === 400 || status === 404) && STRUCTURED_OUTPUT.test(body)) {
    return "ai_model_no_structured_output";
  }
  if (status === 402) return "ai_key_no_credit";
  if ((status === 400 || status === 403 || status === 429) && NO_CREDIT.test(body)) {
    return "ai_key_no_credit";
  }
  if (status === 401) return "ai_key_invalid";
  if (status === 403 && /permission_error/.test(body)) return "ai_key_invalid";
  if (status === 429) return "ai_rate_limited";
  if (status === 404) return "ai_model_not_found";
  if (status === 400 && /model/i.test(body) && UNKNOWN_MODEL.test(body)) {
    return "ai_model_not_found";
  }
  if (status >= 400 && status < 500 && status !== 408 && status !== 409) {
    return "ai_provider_error";
  }
  return undefined;
}

function nestedError(error: object): unknown {
  if ("lastError" in error) return error.lastError;
  if ("cause" in error) return error.cause;
  return undefined;
}

/**
 * Classifies an error thrown by an AI SDK call, looking through the SDK's
 * retry wrapper and `cause` chains for the provider's response.
 */
export function classifyAiCallError(error: unknown): AiErrorCode | undefined {
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    if (APICallError.isInstance(current)) {
      return current.statusCode === undefined
        ? undefined
        : classifyProviderResponse(current.statusCode, current.responseBody ?? current.message);
    }
    if (typeof current !== "object" || current === null) return undefined;
    current = nestedError(current);
  }
  return undefined;
}
