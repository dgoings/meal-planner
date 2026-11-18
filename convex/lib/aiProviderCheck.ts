import { classifyProviderResponse } from "./aiErrors";
import { AiSettingsError, type AiModelConfig } from "./aiModel";

const TIMEOUT_MS = 10_000;

type OpenRouterModels = {
  data?: Array<{ id?: unknown; supported_parameters?: unknown }>;
};

async function request(fetchImpl: typeof fetch, url: string, headers: Record<string, string>) {
  let response: Response;
  try {
    // A redirect would carry the key header to another host, so refuse it.
    response = await fetchImpl(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AiSettingsError("ai_provider_unreachable");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiSettingsError(
      classifyProviderResponse(response.status, body) ?? "ai_provider_unreachable",
    );
  }
  return response;
}

/**
 * A validation call made when the user saves settings. It uses metadata
 * endpoints, so it spends no tokens.
 *
 * - Anthropic: lists models to check the key only. The list holds model IDs
 *   and is not documented to include aliases, so a model missing from it is
 *   not proof of a typo; a bad model surfaces at first use instead.
 * - OpenAI: retrieves the model, which checks the key and the model.
 * - OpenRouter: reads the key, then requires the model to be listed with
 *   `structured_outputs` among its supported parameters.
 */
export async function checkProviderKey(
  config: AiModelConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { provider, model, apiKey } = config;
  if (provider === "anthropic") {
    await request(fetchImpl, "https://api.anthropic.com/v1/models?limit=1", {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    return;
  }

  const authorization = { Authorization: `Bearer ${apiKey}` };
  if (provider === "openai") {
    await request(
      fetchImpl,
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      authorization,
    );
    return;
  }

  await request(fetchImpl, "https://openrouter.ai/api/v1/key", authorization);
  const response = await request(fetchImpl, "https://openrouter.ai/api/v1/models", authorization);
  let models: OpenRouterModels;
  try {
    models = (await response.json()) as OpenRouterModels;
  } catch {
    throw new AiSettingsError("ai_provider_unreachable");
  }
  const entry = models.data?.find((candidate) => candidate.id === model);
  if (entry === undefined) throw new AiSettingsError("ai_model_not_found");
  const parameters = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : [];
  if (!parameters.includes("structured_outputs")) {
    throw new AiSettingsError("ai_model_no_structured_output");
  }
}
