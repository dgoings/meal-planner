import type { AiErrorCode } from "./aiErrorCodes";

export const AI_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiModelConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string;
};

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

/** Placeholder text for the Settings model field. Only Anthropic has a default. */
export const AI_MODEL_SUGGESTIONS: Record<AiProvider, string> = {
  anthropic: DEFAULT_ANTHROPIC_MODEL,
  openai: "gpt-6-luna",
  openrouter: "anthropic/claude-haiku-5.5",
};

const MAX_MODEL_LENGTH = 200;

/** A failure in the user's AI settings. The message is the code itself. */
export class AiSettingsError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(code);
    this.name = "AiSettingsError";
  }
}

export function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The trimmed model, or undefined when an Anthropic model is left blank (the
 * default then applies at call time). OpenAI and OpenRouter have no default.
 */
export function normalizeModel(
  provider: AiProvider,
  model: string | undefined,
): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed) {
    if (provider === "anthropic") return undefined;
    throw new AiSettingsError("ai_model_required");
  }
  if (trimmed.length > MAX_MODEL_LENGTH || /\s/.test(trimmed)) {
    throw new AiSettingsError("ai_model_invalid");
  }
  if (provider === "openrouter" && !trimmed.includes("/")) {
    throw new AiSettingsError("ai_model_invalid");
  }
  return trimmed;
}

/** Builds the model configuration from a user's saved settings. */
export function resolveAiModelConfig(input: {
  provider: AiProvider;
  model?: string;
  apiKey: string;
}): AiModelConfig {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new AiSettingsError("ai_key_missing");
  const model = normalizeModel(input.provider, input.model) ?? DEFAULT_ANTHROPIC_MODEL;
  return { provider: input.provider, model, apiKey };
}

/** "anthropic/claude-sonnet-5" style label stored on the import. */
export function aiModelLabel(config: AiModelConfig): string {
  return `${config.provider}/${config.model}`;
}
