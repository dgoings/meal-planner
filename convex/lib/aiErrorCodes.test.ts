import { describe, expect, it } from "vitest";
import { isAiErrorCode } from "./aiErrorCodes";

describe("isAiErrorCode", () => {
  it("accepts only known codes", () => {
    expect(isAiErrorCode("ai_key_missing")).toBe(true);
    expect(isAiErrorCode("search_failed")).toBe(false);
    expect(isAiErrorCode(3)).toBe(false);
  });
});
