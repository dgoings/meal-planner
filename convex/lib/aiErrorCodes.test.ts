import { describe, expect, it } from "vitest";
import { aiErrorCodeIn, isAiErrorCode } from "./aiErrorCodes";

describe("aiErrorCodeIn", () => {
  it("finds a bare code", () => {
    expect(aiErrorCodeIn("ai_key_invalid")).toBe("ai_key_invalid");
  });

  it("finds a code inside a thrown workflow message with a stack", () => {
    expect(
      aiErrorCodeIn("Uncaught Error: ai_rate_limited\n    at handler (x.js:1)"),
    ).toBe("ai_rate_limited");
  });

  it("ignores unknown codes and other messages", () => {
    expect(aiErrorCodeIn("ai_key_invalidated")).toBeUndefined();
    expect(aiErrorCodeIn("The agent did not find a complete recipe")).toBeUndefined();
    expect(aiErrorCodeIn(undefined)).toBeUndefined();
  });
});

describe("isAiErrorCode", () => {
  it("accepts only known codes", () => {
    expect(isAiErrorCode("ai_key_missing")).toBe(true);
    expect(isAiErrorCode("search_failed")).toBe(false);
    expect(isAiErrorCode(3)).toBe(false);
  });
});
