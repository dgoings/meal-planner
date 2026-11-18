export type RecipeModelProvider = "anthropic" | "openai" | "openrouter";

export type RecipeModelConfig = {
  provider: RecipeModelProvider;
  model: string;
  apiKey: string;
};

export const DEFAULT_ANTHROPIC_RECIPE_MODEL = "claude-sonnet-5";
export const DEFAULT_OPENAI_RECIPE_MODEL = "gpt-5-mini";

const DEFAULT_MODELS: Partial<Record<RecipeModelProvider, string>> = {
  anthropic: DEFAULT_ANTHROPIC_RECIPE_MODEL,
  openai: DEFAULT_OPENAI_RECIPE_MODEL,
};

const API_KEY_VARIABLES: Record<RecipeModelProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const PROVIDERS = Object.keys(API_KEY_VARIABLES) as RecipeModelProvider[];

function isRecipeModelProvider(value: string): value is RecipeModelProvider {
  return (PROVIDERS as string[]).includes(value);
}

function configured(value: string | undefined) {
  return value?.trim() || undefined;
}

/**
 * Reads the recipe agent's provider, model, and API key from deployment
 * environment variables.
 *
 * Throws Error with a user-readable message on any misconfiguration.
 */
export function resolveRecipeModelConfig(
  env: Record<string, string | undefined>,
): RecipeModelConfig {
  const providersWithKeys = PROVIDERS.filter((provider) =>
    configured(env[API_KEY_VARIABLES[provider]]),
  );

  let provider: RecipeModelProvider;
  const namedProvider = configured(env.RECIPE_AGENT_PROVIDER)?.toLowerCase();
  if (namedProvider !== undefined) {
    if (!isRecipeModelProvider(namedProvider)) {
      throw new Error(
        `RECIPE_AGENT_PROVIDER must be one of ${PROVIDERS.join(", ")}`,
      );
    }
    provider = namedProvider;
  } else if (providersWithKeys.length === 1) {
    provider = providersWithKeys[0];
  } else if (providersWithKeys.includes("openai")) {
    provider = "openai";
  } else if (providersWithKeys.length === 0) {
    throw new Error(
      "No recipe model API key is configured on this Convex deployment; set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY",
    );
  } else {
    throw new Error(
      `Several recipe model API keys are configured (${providersWithKeys
        .map((p) => API_KEY_VARIABLES[p])
        .join(", ")}); set RECIPE_AGENT_PROVIDER to choose one of ${PROVIDERS.join(", ")}`,
    );
  }

  const keyVariable = API_KEY_VARIABLES[provider];
  const apiKey = configured(env[keyVariable]);
  if (apiKey === undefined) {
    throw new Error(
      `${keyVariable} is not configured on this Convex deployment (RECIPE_AGENT_PROVIDER is ${provider})`,
    );
  }

  const configuredModel = configured(env.RECIPE_AGENT_MODEL);
  const model = configuredModel ?? DEFAULT_MODELS[provider];
  if (model === undefined) {
    throw new Error(
      `RECIPE_AGENT_MODEL must name a ${provider} model on this Convex deployment; there is no default for ${provider}`,
    );
  }

  return { provider, model, apiKey };
}

/** "anthropic/claude-sonnet-5" style label stored on the import. */
export function recipeModelLabel(config: RecipeModelConfig): string {
  return `${config.provider}/${config.model}`;
}
