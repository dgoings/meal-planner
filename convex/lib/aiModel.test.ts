import { describe, expect, it } from "vitest";
import {
  aiModelLabel,
  AiSettingsError,
  normalizeModel,
  resolveAiModelConfig,
} from "./aiModel";

function codeOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error instanceof AiSettingsError ? error.code : "not an AiSettingsError";
  }
  return "no error";
}

describe("resolveAiModelConfig", () => {
  it("uses the Anthropic default when the model is blank or missing", () => {
    expect(resolveAiModelConfig({ provider: "anthropic", apiKey: "k" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "k",
    });
    expect(resolveAiModelConfig({ provider: "anthropic", model: "  ", apiKey: "k" }).model).toBe(
      "claude-sonnet-5",
    );
  });

  it("trims an Anthropic model and the key", () => {
    expect(
      resolveAiModelConfig({ provider: "anthropic", model: " claude-x ", apiKey: "  k  " }),
    ).toEqual({ provider: "anthropic", model: "claude-x", apiKey: "k" });
  });

  it("requires a model for OpenAI", () => {
    expect(codeOf(() => resolveAiModelConfig({ provider: "openai", apiKey: "k" }))).toBe(
      "ai_model_required",
    );
    expect(resolveAiModelConfig({ provider: "openai", model: "gpt-x", apiKey: "k" }).model).toBe(
      "gpt-x",
    );
  });

  it("requires a vendor/model ID for OpenRouter", () => {
    expect(
      resolveAiModelConfig({ provider: "openrouter", model: "vendor/model", apiKey: "k" }).model,
    ).toBe("vendor/model");
    expect(
      codeOf(() => resolveAiModelConfig({ provider: "openrouter", model: "model", apiKey: "k" })),
    ).toBe("ai_model_invalid");
    expect(
      codeOf(() => resolveAiModelConfig({ provider: "openrouter", model: " ", apiKey: "k" })),
    ).toBe("ai_model_required");
  });

  it("rejects overlong models and models with spaces", () => {
    expect(codeOf(() => normalizeModel("openai", "g".repeat(201)))).toBe("ai_model_invalid");
    expect(codeOf(() => normalizeModel("openai", "gpt x"))).toBe("ai_model_invalid");
  });

  it("requires a key", () => {
    expect(codeOf(() => resolveAiModelConfig({ provider: "anthropic", apiKey: "  " }))).toBe(
      "ai_key_missing",
    );
  });
});

describe("aiModelLabel", () => {
  it("prefixes the model with its provider", () => {
    expect(
      aiModelLabel({ provider: "openrouter", model: "vendor/model", apiKey: "k" }),
    ).toBe("openrouter/vendor/model");
  });
});
