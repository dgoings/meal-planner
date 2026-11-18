import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { AI_ERROR_CODES } from "@/convex/lib/aiErrorCodes";
import {
  AI_ERROR_COPY,
  convexErrorCode,
  isMissingKeyCode,
  recipeImportFailureMessage,
  retryFailureMessage,
} from "./recipe-import-errors";

describe("recipeImportFailureMessage", () => {
  it("explains each AI failure code", () => {
    expect(recipeImportFailureMessage("ai_key_missing")).toBe(
      "Add an AI key in Settings to import this recipe, then choose Try again.",
    );
    expect(recipeImportFailureMessage("ai_key_invalid")).toBe(
      "Your AI provider rejected your key. Update it in Settings, then try again.",
    );
    expect(recipeImportFailureMessage("ai_key_no_credit")).toBe(
      "Your AI provider account is out of credit or over its spending limit. Add credit with your provider, then try again.",
    );
    expect(recipeImportFailureMessage("ai_rate_limited")).toBe(
      "Your AI provider is limiting requests right now. Wait a minute, then try again.",
    );
    expect(recipeImportFailureMessage("ai_model_not_found")).toBe(
      "Your AI provider doesn’t recognise the model in Settings. Check the model name, then try again.",
    );
    expect(recipeImportFailureMessage("ai_model_no_structured_output")).toBe(
      "The model in Settings can’t return structured recipe data. Choose a different model, then try again.",
    );
    expect(recipeImportFailureMessage("ai_key_unreadable")).toBe(
      "Your saved AI key can no longer be read. Paste it again in Settings, then try again.",
    );
    expect(recipeImportFailureMessage("ai_not_configured")).toBe(
      "AI features aren’t available on this PerfectPlate deployment right now. Contact the person who runs it.",
    );
    expect(recipeImportFailureMessage("ai_provider_error")).toBe(
      "Your AI provider couldn’t complete the request. Check your provider account, then try again.",
    );
    for (const code of AI_ERROR_CODES) expect(AI_ERROR_COPY[code]).toBeTruthy();
  });

  it("finds a code inside a longer message", () => {
    expect(recipeImportFailureMessage("Uncaught Error: ai_key_invalid\n    at x")).toBe(
      AI_ERROR_COPY.ai_key_invalid,
    );
  });

  it("keeps the existing messages", () => {
    expect(recipeImportFailureMessage("recipe_scrape_failed: timeout")).toBe(
      "We couldn’t scrape a complete recipe from that website.",
    );
    expect(recipeImportFailureMessage(undefined)).toBe(
      "We couldn’t read a complete recipe from that page.",
    );
  });
});

describe("error code helpers", () => {
  it("reads the code from a ConvexError", () => {
    expect(convexErrorCode(new ConvexError({ code: "ai_key_missing" }))).toBe("ai_key_missing");
    expect(convexErrorCode(new Error("ai_key_missing"))).toBeUndefined();
  });

  it("recognizes codes that mean no usable key", () => {
    expect(isMissingKeyCode("ai_key_missing")).toBe(true);
    expect(isMissingKeyCode("ai_key_unreadable")).toBe(true);
    expect(isMissingKeyCode("ai_not_configured")).toBe(true);
    expect(isMissingKeyCode("ai_key_invalid")).toBe(false);
    expect(isMissingKeyCode(undefined)).toBe(false);
  });

  it("explains a refused retry", () => {
    expect(retryFailureMessage(new ConvexError({ code: "ai_key_missing" }))).toBe(
      "Add an AI key in Settings, then try again.",
    );
    expect(retryFailureMessage(new ConvexError({ code: "ai_not_configured" }))).toBe(
      AI_ERROR_COPY.ai_not_configured,
    );
    expect(retryFailureMessage(new Error("too many times"))).toBeUndefined();
  });
});
