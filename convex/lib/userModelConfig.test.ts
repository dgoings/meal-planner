import { describe, expect, it } from "vitest";
import { TEST_AI_KEY_SECRET } from "../testing.helpers";
import { encryptApiKey } from "./aiKeyCrypto";
import type { AiProvider } from "./aiModel";
import { userModelConfig } from "./userModelConfig";

const KEY = "sk-test-0000-1a2b";

async function row(provider: AiProvider = "anthropic", model?: string, userId = "user-1") {
  return { provider, model, ...(await encryptApiKey(TEST_AI_KEY_SECRET, KEY, { userId, provider })) };
}

describe("userModelConfig", () => {
  it("decrypts a saved Anthropic key and applies the default model", async () => {
    expect(await userModelConfig(await row(), TEST_AI_KEY_SECRET, "user-1")).toEqual({
      kind: "ready",
      config: { provider: "anthropic", model: "claude-sonnet-5", apiKey: KEY },
    });
  });

  it("reports a missing key", async () => {
    expect(await userModelConfig(null, TEST_AI_KEY_SECRET, "user-1")).toEqual({
      kind: "aiFailure",
      code: "ai_key_missing",
    });
  });

  it("reports a key already marked unreadable without decrypting", async () => {
    const stored = { ...(await row()), unreadableAt: 1 };
    expect(await userModelConfig(stored, TEST_AI_KEY_SECRET, "user-1")).toEqual({
      kind: "aiFailure",
      code: "ai_key_unreadable",
    });
  });

  it("fails closed when the secret is missing", async () => {
    expect(await userModelConfig(await row(), undefined, "user-1")).toEqual({
      kind: "aiFailure",
      code: "ai_not_configured",
    });
  });

  it("reports a key that no longer decrypts", async () => {
    const otherSecret = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    expect(await userModelConfig(await row(), otherSecret, "user-1")).toEqual({
      kind: "aiFailure",
      code: "ai_key_unreadable",
    });
    expect(await userModelConfig(await row(), TEST_AI_KEY_SECRET, "user-2")).toEqual({
      kind: "aiFailure",
      code: "ai_key_unreadable",
    });
  });

  it("reports an invalid stored model", async () => {
    expect(await userModelConfig(await row("openai"), TEST_AI_KEY_SECRET, "user-1")).toEqual({
      kind: "aiFailure",
      code: "ai_model_required",
    });
  });
});
