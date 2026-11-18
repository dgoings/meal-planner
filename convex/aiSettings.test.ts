import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { aiReadiness } from "./aiSettings";
import { encryptApiKey } from "./lib/aiKeyCrypto";
import type { AiProvider } from "./lib/aiModel";
import {
  initAuthTest,
  signedInUser,
  TEST_AI_KEY_SECRET,
  type AuthTest,
} from "./testing.helpers";

const KEY = "sk-test-0000-1a2b";

beforeEach(() => {
  vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", TEST_AI_KEY_SECRET);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function storeKey(
  t: AuthTest,
  userId: Id<"users">,
  provider: AiProvider = "anthropic",
  model?: string,
  apiKey = KEY,
) {
  const encrypted = await encryptApiKey(TEST_AI_KEY_SECRET, apiKey, { userId, provider });
  await t.mutation(internal.aiSettings.store, {
    userId,
    provider,
    ...(model === undefined ? {} : { model }),
    ...encrypted,
    keyHint: apiKey.slice(-4),
  });
  return encrypted;
}

async function rows(t: AuthTest) {
  return await t.run(async (ctx) => await ctx.db.query("aiSettings").collect());
}

describe("aiSettings.get", () => {
  it("returns null when signed out", async () => {
    const t = initAuthTest();
    expect(await t.query(api.aiSettings.get, {})).toBeNull();
  });

  it("reports no settings and whether encryption is available", async () => {
    const t = initAuthTest();
    const { as } = await signedInUser(t, "ada@example.com");
    expect(await as.query(api.aiSettings.get, {})).toEqual({
      encryptionAvailable: true,
      settings: null,
    });
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "");
    expect(await as.query(api.aiSettings.get, {})).toEqual({
      encryptionAvailable: false,
      settings: null,
    });
  });

  it("shows provider, model and hint but never the key or ciphertext", async () => {
    const t = initAuthTest();
    const { userId, as } = await signedInUser(t, "ada@example.com");
    const encrypted = await storeKey(t, userId);
    const result = await as.query(api.aiSettings.get, {});
    expect(result).toMatchObject({
      encryptionAvailable: true,
      settings: {
        provider: "anthropic",
        model: null,
        effectiveModel: "claude-sonnet-5",
        keyHint: "1a2b",
        needsNewKey: false,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain(encrypted.keyCiphertext);
    expect(serialized).not.toContain(encrypted.keyIv);
  });
});

describe("aiSettings storage", () => {
  it("upserts one row per user and clears the unreadable flag", async () => {
    const t = initAuthTest();
    const { userId, as } = await signedInUser(t, "ada@example.com");
    const { keyIv } = await storeKey(t, userId);
    await t.mutation(internal.aiSettings.markUnreadable, { userId, keyIv });
    expect((await as.query(api.aiSettings.get, {}))?.settings?.needsNewKey).toBe(true);

    await storeKey(t, userId, "openai", "gpt-x", "sk-test-9999-zzzz");
    const stored = await rows(t);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ provider: "openai", model: "gpt-x", keyHint: "zzzz" });
    expect(stored[0].unreadableAt).toBeUndefined();
    expect(await t.query(internal.aiSettings.encryptedForUser, { userId })).toMatchObject({
      provider: "openai",
      keyCiphertext: stored[0].keyCiphertext,
    });
  });

  it("does not flag a key saved again after the failed read", async () => {
    const t = initAuthTest();
    const { userId, as } = await signedInUser(t, "ada@example.com");
    const stale = await storeKey(t, userId);
    // The user saves a new key while extraction is failing on the old one.
    await storeKey(t, userId, "anthropic", undefined, "sk-test-9999-zzzz");

    await t.mutation(internal.aiSettings.markUnreadable, { userId, keyIv: stale.keyIv });
    expect((await as.query(api.aiSettings.get, {}))?.settings).toMatchObject({
      keyHint: "zzzz",
      needsNewKey: false,
    });
  });

  it("refuses to store a key for an account being deleted", async () => {
    const t = initAuthTest();
    const { userId } = await signedInUser(t, "ada@example.com");
    await t.run(async (ctx) => ctx.db.patch(userId, { deletionRequestedAt: Date.now() }));
    await expect(storeKey(t, userId)).rejects.toThrow("User was not found");
  });

  it("removes only the caller's key, idempotently", async () => {
    const t = initAuthTest();
    await expect(t.mutation(api.aiSettings.remove, {})).rejects.toThrow("Unauthenticated");
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await storeKey(t, ada.userId);
    await storeKey(t, grace.userId);

    await ada.as.mutation(api.aiSettings.remove, {});
    await ada.as.mutation(api.aiSettings.remove, {});
    expect((await rows(t)).map((row) => row.userId)).toEqual([grace.userId]);
  });
});

describe("aiReadiness", () => {
  it("reports each state without decrypting", async () => {
    const t = initAuthTest();
    const { userId } = await signedInUser(t, "ada@example.com");
    const readiness = () => t.run(async (ctx) => await aiReadiness(ctx, userId));

    expect(await readiness()).toBe("ai_key_missing");
    const { keyIv } = await storeKey(t, userId);
    expect(await readiness()).toBe("ready");
    await t.mutation(internal.aiSettings.markUnreadable, { userId, keyIv });
    expect(await readiness()).toBe("ai_key_unreadable");
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "");
    expect(await readiness()).toBe("ai_not_configured");
  });
});

describe("aiSettings.save", () => {
  function stubFetch(status = 200, body: unknown = { data: [] }) {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(body), { status }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("validates, encrypts and stores a new key", async () => {
    const t = initAuthTest();
    const { userId, as } = await signedInUser(t, "ada@example.com");
    const fetchMock = stubFetch();

    expect(
      await as.action(api.aiSettings.save, { provider: "anthropic", model: " ", apiKey: ` ${KEY} ` }),
    ).toEqual({ provider: "anthropic", model: null, keyHint: "1a2b" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [stored] = await rows(t);
    expect(stored).toMatchObject({ userId, provider: "anthropic", keyHint: "1a2b", keyScheme: 1 });
    expect(stored.model).toBeUndefined();
    expect(stored.keyCiphertext).not.toContain(KEY);
    const { decryptApiKey } = await import("./lib/aiKeyCrypto");
    expect(
      await decryptApiKey(TEST_AI_KEY_SECRET, stored, { userId, provider: "anthropic" }),
    ).toBe(KEY);
    expect((await as.query(api.aiSettings.get, {}))?.settings?.keyHint).toBe("1a2b");
  });

  it("stores nothing when the provider rejects the key", async () => {
    const t = initAuthTest();
    const { as } = await signedInUser(t, "ada@example.com");
    stubFetch(401, { error: { message: "invalid x-api-key" } });
    await expect(
      as.action(api.aiSettings.save, { provider: "anthropic", apiKey: KEY }),
    ).rejects.toThrow("ai_key_invalid");
    expect(await rows(t)).toHaveLength(0);
  });

  it("checks the model and key shape before calling the provider", async () => {
    const t = initAuthTest();
    const { as } = await signedInUser(t, "ada@example.com");
    const fetchMock = stubFetch();
    await expect(
      as.action(api.aiSettings.save, { provider: "openai", model: "", apiKey: KEY }),
    ).rejects.toThrow("ai_model_required");
    await expect(
      as.action(api.aiSettings.save, { provider: "anthropic", apiKey: "sk test" }),
    ).rejects.toThrow("ai_key_malformed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the saved key when the key is left blank for the same provider", async () => {
    const t = initAuthTest();
    const { userId, as } = await signedInUser(t, "ada@example.com");
    await storeKey(t, userId, "openai", "gpt-x");
    const fetchMock = stubFetch(200, { id: "gpt-y" });

    expect(
      await as.action(api.aiSettings.save, { provider: "openai", model: "gpt-y" }),
    ).toEqual({ provider: "openai", model: "gpt-y", keyHint: "1a2b" });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe(
      `Bearer ${KEY}`,
    );
    expect((await rows(t))[0].model).toBe("gpt-y");

    await expect(
      as.action(api.aiSettings.save, { provider: "anthropic" }),
    ).rejects.toThrow("ai_key_missing");
  });

  it("asks for a key when none is saved", async () => {
    const t = initAuthTest();
    const { as } = await signedInUser(t, "ada@example.com");
    stubFetch();
    await expect(as.action(api.aiSettings.save, { provider: "anthropic" })).rejects.toThrow(
      "ai_key_missing",
    );
  });

  it("fails closed without the encryption secret", async () => {
    const t = initAuthTest();
    const { as } = await signedInUser(t, "ada@example.com");
    const fetchMock = stubFetch();
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "");
    await expect(
      as.action(api.aiSettings.save, { provider: "anthropic", apiKey: KEY }),
    ).rejects.toThrow("ai_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    const t = initAuthTest();
    await expect(
      t.action(api.aiSettings.save, { provider: "anthropic", apiKey: KEY }),
    ).rejects.toThrow("Unauthenticated");
  });
});
