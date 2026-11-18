import { describe, expect, it, vi } from "vitest";
import { AiSettingsError, type AiModelConfig } from "./aiModel";
import { checkProviderKey } from "./aiProviderCheck";

const KEY = "sk-test-0000-1a2b";

function respond(...responses: Array<{ status: number; body?: unknown }>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const { status, body } of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(typeof body === "string" ? body : JSON.stringify(body ?? {}), { status }),
    );
  }
  return fetchMock;
}

async function codeOf(config: AiModelConfig, fetchMock: typeof fetch) {
  try {
    await checkProviderKey(config, fetchMock);
  } catch (error) {
    return error instanceof AiSettingsError ? error.code : "not an AiSettingsError";
  }
  return "ok";
}

function headersOf(fetchMock: ReturnType<typeof respond>, call = 0) {
  return new Headers(fetchMock.mock.calls[call][1]?.headers);
}

const anthropic: AiModelConfig = { provider: "anthropic", model: "claude-sonnet-5", apiKey: KEY };
const openai: AiModelConfig = { provider: "openai", model: "gpt-x", apiKey: KEY };
const openrouter: AiModelConfig = { provider: "openrouter", model: "vendor/model", apiKey: KEY };

describe("checkProviderKey", () => {
  it("checks an Anthropic key by listing models", async () => {
    const fetchMock = respond({ status: 200, body: { data: [] } });
    expect(await codeOf(anthropic, fetchMock)).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(headersOf(fetchMock).get("x-api-key")).toBe(KEY);
    expect(headersOf(fetchMock).get("anthropic-version")).toBe("2023-06-01");
  });

  it("checks an OpenAI key and model together", async () => {
    const fetchMock = respond({ status: 200, body: { id: "gpt-x" } });
    expect(await codeOf(openai, fetchMock)).toBe("ok");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models/gpt-x");
    expect(headersOf(fetchMock).get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("checks an OpenRouter key, then the model and its structured-output support", async () => {
    const models = {
      data: [
        { id: "vendor/model", supported_parameters: ["tools", "structured_outputs"] },
        { id: "vendor/plain", supported_parameters: ["tools"] },
      ],
    };
    const ok = respond({ status: 200, body: { data: {} } }, { status: 200, body: models });
    expect(await codeOf(openrouter, ok)).toBe("ok");
    expect(ok.mock.calls.map(([url]) => url)).toEqual([
      "https://openrouter.ai/api/v1/key",
      "https://openrouter.ai/api/v1/models",
    ]);
    expect(headersOf(ok).get("authorization")).toBe(`Bearer ${KEY}`);

    expect(
      await codeOf(
        { ...openrouter, model: "vendor/missing" },
        respond({ status: 200 }, { status: 200, body: models }),
      ),
    ).toBe("ai_model_not_found");
    expect(
      await codeOf(
        { ...openrouter, model: "vendor/plain" },
        respond({ status: 200 }, { status: 200, body: models }),
      ),
    ).toBe("ai_model_no_structured_output");
  });

  it("maps provider rejections to codes", async () => {
    expect(await codeOf(anthropic, respond({ status: 401, body: "{}" }))).toBe("ai_key_invalid");
    expect(await codeOf(openai, respond({ status: 404, body: "{}" }))).toBe("ai_model_not_found");
    expect(await codeOf(openrouter, respond({ status: 402, body: "{}" }))).toBe("ai_key_no_credit");
  });

  it("reports an unreachable provider", async () => {
    expect(await codeOf(anthropic, respond({ status: 503, body: "down" }))).toBe(
      "ai_provider_unreachable",
    );
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await codeOf(anthropic, offline)).toBe("ai_provider_unreachable");
  });
});
