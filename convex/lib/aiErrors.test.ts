import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
  classifyAiCallError,
  classifyProviderResponse,
  extractionFailureDecision,
} from "./aiErrors";

function apiError(statusCode: number, responseBody: string) {
  return new APICallError({
    message: "provider call failed",
    url: "https://provider.test/v1",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });
}

describe("classifyProviderResponse", () => {
  it("recognizes models without structured output", () => {
    expect(
      classifyProviderResponse(
        400,
        `{"error":{"message":"Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model.","param":"response_format"}}`,
      ),
    ).toBe("ai_model_no_structured_output");
    expect(
      classifyProviderResponse(
        404,
        `{"error":{"code":404,"message":"No endpoints found that support the requested parameters"}}`,
      ),
    ).toBe("ai_model_no_structured_output");
  });

  it("recognizes billing and spend-limit failures", () => {
    expect(classifyProviderResponse(402, `{"error":{"code":402,"message":"Insufficient credits"}}`)).toBe(
      "ai_key_no_credit",
    );
    expect(
      classifyProviderResponse(402, `{"type":"error","error":{"type":"billing_error","message":"x"}}`),
    ).toBe("ai_key_no_credit");
    expect(
      classifyProviderResponse(429, `{"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}`),
    ).toBe("ai_key_no_credit");
    expect(
      classifyProviderResponse(429, `{"error":{"code":"project_spend_limit_exceeded"}}`),
    ).toBe("ai_key_no_credit");
    expect(
      classifyProviderResponse(
        400,
        `{"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits."}}`,
      ),
    ).toBe("ai_key_no_credit");
  });

  it("recognizes rejected keys", () => {
    expect(classifyProviderResponse(401, `{"error":{"message":"Incorrect API key provided"}}`)).toBe(
      "ai_key_invalid",
    );
    expect(
      classifyProviderResponse(403, `{"type":"error","error":{"type":"permission_error","message":"x"}}`),
    ).toBe("ai_key_invalid");
  });

  it("recognizes rate limits", () => {
    expect(
      classifyProviderResponse(429, `{"type":"error","error":{"type":"rate_limit_error","message":"x"}}`),
    ).toBe("ai_rate_limited");
  });

  it("recognizes unknown models", () => {
    expect(
      classifyProviderResponse(404, `{"type":"error","error":{"type":"not_found_error","message":"model: x"}}`),
    ).toBe("ai_model_not_found");
    expect(
      classifyProviderResponse(400, `{"error":{"code":400,"message":"vendor/x is not a valid model ID"}}`),
    ).toBe("ai_model_not_found");
  });

  it("treats other client errors as a generic provider error", () => {
    expect(classifyProviderResponse(403, `{"error":{"message":"Country, region, or territory not supported"}}`)).toBe(
      "ai_provider_error",
    );
    expect(classifyProviderResponse(400, `{"error":{"message":"bad request"}}`)).toBe("ai_provider_error");
  });

  it("leaves server errors and timeouts retryable", () => {
    expect(classifyProviderResponse(500, "oops")).toBeUndefined();
    expect(classifyProviderResponse(529, "overloaded")).toBeUndefined();
    expect(classifyProviderResponse(408, "timeout")).toBeUndefined();
  });
});

describe("classifyAiCallError", () => {
  it("classifies an APICallError directly and when wrapped", () => {
    const error = apiError(401, `{"error":{"message":"invalid"}}`);
    expect(classifyAiCallError(error)).toBe("ai_key_invalid");
    expect(classifyAiCallError({ name: "AI_RetryError", lastError: error })).toBe("ai_key_invalid");
    expect(classifyAiCallError(new Error("wrapped", { cause: error }))).toBe("ai_key_invalid");
  });

  it("does not classify unrelated errors", () => {
    expect(classifyAiCallError(new Error("network down"))).toBeUndefined();
    expect(classifyAiCallError(apiError(503, "unavailable"))).toBeUndefined();
    expect(classifyAiCallError("text")).toBeUndefined();
  });
});

describe("extractionFailureDecision", () => {
  it("ends the import for failures a retry cannot fix", () => {
    expect(extractionFailureDecision(apiError(401, "{}"))).toEqual({
      kind: "aiFailure",
      code: "ai_key_invalid",
    });
    expect(
      extractionFailureDecision(apiError(429, `{"error":{"code":"insufficient_quota"}}`)),
    ).toEqual({ kind: "aiFailure", code: "ai_key_no_credit" });
  });

  it("retries a plain rate limit and remembers that it was one", () => {
    const limited = apiError(429, `{"type":"error","error":{"type":"rate_limit_error"}}`);
    expect(extractionFailureDecision({ name: "AI_RetryError", lastError: limited })).toEqual({
      kind: "retry",
      rateLimited: true,
    });
  });

  it("retries transient and unknown errors", () => {
    expect(extractionFailureDecision(apiError(500, "oops"))).toEqual({
      kind: "retry",
      rateLimited: false,
    });
    expect(extractionFailureDecision(new Error("socket hang up"))).toEqual({
      kind: "retry",
      rateLimited: false,
    });
  });
});
