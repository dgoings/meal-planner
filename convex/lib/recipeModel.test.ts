import { describe, expect, it } from "vitest";
import { recipeModelLabel, resolveRecipeModelConfig } from "./recipeModel";

describe("resolveRecipeModelConfig", () => {
  it("infers Anthropic with the default model from a lone Anthropic key", () => {
    expect(resolveRecipeModelConfig({ ANTHROPIC_API_KEY: " k " })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      apiKey: "k",
    });
  });

  it("uses RECIPE_AGENT_MODEL for Anthropic when set", () => {
    expect(
      resolveRecipeModelConfig({
        ANTHROPIC_API_KEY: "k",
        RECIPE_AGENT_MODEL: "claude-x",
      }),
    ).toEqual({ provider: "anthropic", model: "claude-x", apiKey: "k" });
  });

  it("infers OpenRouter from a lone OpenRouter key", () => {
    expect(
      resolveRecipeModelConfig({
        OPENROUTER_API_KEY: "k",
        RECIPE_AGENT_MODEL: "vendor/model",
      }),
    ).toEqual({ provider: "openrouter", model: "vendor/model", apiKey: "k" });
  });

  it("requires RECIPE_AGENT_MODEL for OpenAI", () => {
    expect(() => resolveRecipeModelConfig({ OPENAI_API_KEY: "k" })).toThrow(
      /RECIPE_AGENT_MODEL/,
    );
  });

  it("requires RECIPE_AGENT_MODEL for OpenRouter", () => {
    expect(() => resolveRecipeModelConfig({ OPENROUTER_API_KEY: "k" })).toThrow(
      /RECIPE_AGENT_MODEL/,
    );
  });

  it("refuses to guess when several keys are set and no provider is named", () => {
    expect(() =>
      resolveRecipeModelConfig({
        ANTHROPIC_API_KEY: "a",
        OPENROUTER_API_KEY: "o",
      }),
    ).toThrow(/RECIPE_AGENT_PROVIDER/);
  });

  it("accepts a trimmed, case-insensitive RECIPE_AGENT_PROVIDER", () => {
    expect(
      resolveRecipeModelConfig({
        ANTHROPIC_API_KEY: "a",
        OPENROUTER_API_KEY: "o",
        RECIPE_AGENT_PROVIDER: "OpenRouter ",
        RECIPE_AGENT_MODEL: "vendor/model",
      }),
    ).toEqual({ provider: "openrouter", model: "vendor/model", apiKey: "o" });
  });

  it("requires the named provider's key", () => {
    expect(() =>
      resolveRecipeModelConfig({
        RECIPE_AGENT_PROVIDER: "openai",
        ANTHROPIC_API_KEY: "a",
        RECIPE_AGENT_MODEL: "gpt-x",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("requires RECIPE_AGENT_MODEL for a named non-Anthropic provider", () => {
    expect(() =>
      resolveRecipeModelConfig({
        RECIPE_AGENT_PROVIDER: "openai",
        OPENAI_API_KEY: "k",
      }),
    ).toThrow(/RECIPE_AGENT_MODEL/);
  });

  it("rejects an unknown provider", () => {
    expect(() =>
      resolveRecipeModelConfig({
        RECIPE_AGENT_PROVIDER: "mistral",
        ANTHROPIC_API_KEY: "a",
      }),
    ).toThrow(/anthropic, openai, openrouter/);
  });

  it("explains which keys to set when none are configured", () => {
    expect(() => resolveRecipeModelConfig({})).toThrow(
      /ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY/,
    );
  });

  it("treats blank keys as unset", () => {
    expect(() =>
      resolveRecipeModelConfig({
        ANTHROPIC_API_KEY: "  ",
        OPENAI_API_KEY: "",
        OPENROUTER_API_KEY: " ",
      }),
    ).toThrow(/ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY/);
    expect(
      resolveRecipeModelConfig({
        ANTHROPIC_API_KEY: " ",
        OPENROUTER_API_KEY: "o",
        RECIPE_AGENT_MODEL: "vendor/model",
      }),
    ).toEqual({ provider: "openrouter", model: "vendor/model", apiKey: "o" });
  });
});

describe("recipeModelLabel", () => {
  it("prefixes the model with its provider", () => {
    expect(
      recipeModelLabel({
        provider: "openrouter",
        model: "vendor/model",
        apiKey: "k",
      }),
    ).toBe("openrouter/vendor/model");
  });
});
