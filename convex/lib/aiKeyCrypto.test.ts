import { describe, expect, it } from "vitest";
import { TEST_AI_KEY_SECRET } from "../testing.helpers";
import { AiSettingsError } from "./aiModel";
import {
  apiKeyHint,
  decryptApiKey,
  encryptApiKey,
  encryptionSecretAvailable,
  parseEncryptionSecret,
} from "./aiKeyCrypto";

const KEY = "sk-test-0000-1a2b";
const CONTEXT = { userId: "user-1", provider: "anthropic" as const };
const OTHER_SECRET = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

async function codeOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error instanceof AiSettingsError ? error.code : "not an AiSettingsError";
  }
  return "no error";
}

describe("encryptApiKey and decryptApiKey", () => {
  it("round-trips a key", async () => {
    const encrypted = await encryptApiKey(TEST_AI_KEY_SECRET, KEY, CONTEXT);
    expect(await decryptApiKey(TEST_AI_KEY_SECRET, encrypted, CONTEXT)).toBe(KEY);
  });

  it("uses a fresh IV and never stores the plaintext", async () => {
    const first = await encryptApiKey(TEST_AI_KEY_SECRET, KEY, CONTEXT);
    const second = await encryptApiKey(TEST_AI_KEY_SECRET, KEY, CONTEXT);
    expect(first.keyIv).not.toBe(second.keyIv);
    expect(first.keyCiphertext).not.toBe(second.keyCiphertext);
    expect(JSON.stringify(first)).not.toContain(KEY);
    expect(atob(first.keyCiphertext)).not.toContain(KEY);
  });

  it("refuses another secret, user, or provider", async () => {
    const encrypted = await encryptApiKey(TEST_AI_KEY_SECRET, KEY, CONTEXT);
    expect(await codeOf(() => decryptApiKey(OTHER_SECRET, encrypted, CONTEXT))).toBe(
      "ai_key_unreadable",
    );
    expect(
      await codeOf(() =>
        decryptApiKey(TEST_AI_KEY_SECRET, encrypted, { ...CONTEXT, userId: "user-2" }),
      ),
    ).toBe("ai_key_unreadable");
    expect(
      await codeOf(() =>
        decryptApiKey(TEST_AI_KEY_SECRET, encrypted, { ...CONTEXT, provider: "openai" }),
      ),
    ).toBe("ai_key_unreadable");
  });

  it("refuses tampered ciphertext and malformed IVs", async () => {
    const encrypted = await encryptApiKey(TEST_AI_KEY_SECRET, KEY, CONTEXT);
    const bytes = Uint8Array.from(atob(encrypted.keyCiphertext), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    const tampered = { ...encrypted, keyCiphertext: btoa(String.fromCharCode(...bytes)) };
    expect(await codeOf(() => decryptApiKey(TEST_AI_KEY_SECRET, tampered, CONTEXT))).toBe(
      "ai_key_unreadable",
    );
    expect(
      await codeOf(() =>
        decryptApiKey(TEST_AI_KEY_SECRET, { ...encrypted, keyIv: "%%%" }, CONTEXT),
      ),
    ).toBe("ai_key_unreadable");
  });

  it("fails closed when the secret is missing or malformed", async () => {
    const encrypted = await encryptApiKey(TEST_AI_KEY_SECRET, KEY, CONTEXT);
    const sixteenBytes = btoa(String.fromCharCode(...new Uint8Array(16).fill(7)));
    for (const secret of [undefined, "", sixteenBytes, "not base64!"]) {
      expect(encryptionSecretAvailable(secret)).toBe(false);
      expect(await codeOf(() => encryptApiKey(secret, KEY, CONTEXT))).toBe("ai_not_configured");
      expect(await codeOf(() => decryptApiKey(secret, encrypted, CONTEXT))).toBe(
        "ai_not_configured",
      );
    }
    expect(encryptionSecretAvailable(` ${TEST_AI_KEY_SECRET} `)).toBe(true);
    expect(parseEncryptionSecret(TEST_AI_KEY_SECRET)).toHaveLength(32);
  });
});

describe("apiKeyHint", () => {
  it("keeps the last four characters", () => {
    expect(apiKeyHint(KEY)).toBe("1a2b");
  });
});
