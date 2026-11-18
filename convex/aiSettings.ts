import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  AI_KEY_SCHEME,
  apiKeyHint,
  decryptApiKey,
  encryptApiKey,
  encryptionSecretAvailable,
  parseEncryptionSecret,
} from "./lib/aiKeyCrypto";
import {
  AiSettingsError,
  DEFAULT_ANTHROPIC_MODEL,
  normalizeModel,
  resolveAiModelConfig,
  type AiProvider,
} from "./lib/aiModel";
import { checkProviderKey } from "./lib/aiProviderCheck";
import { aiProviderValidator } from "./lib/aiValidators";

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 500;

export type AiReadiness =
  | "ready"
  | "ai_key_missing"
  | "ai_key_unreadable"
  | "ai_not_configured";

async function settingsFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("aiSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Whether AI features can run for `userId`, judged from the saved row and the
 * shape of the deployment secret. It does not decrypt, so a rotated secret is
 * only noticed after the first failed decryption marks the row.
 */
export async function aiReadiness(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<AiReadiness> {
  if (!encryptionSecretAvailable(env.AI_KEY_ENCRYPTION_SECRET)) return "ai_not_configured";
  const settings = await settingsFor(ctx, userId);
  if (settings === null) return "ai_key_missing";
  if (settings.unreadableAt !== undefined) return "ai_key_unreadable";
  return "ready";
}

/** The signed-in user's AI settings, without the key. */
export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      encryptionAvailable: v.boolean(),
      settings: v.union(
        v.null(),
        v.object({
          provider: aiProviderValidator,
          model: v.union(v.string(), v.null()),
          effectiveModel: v.string(),
          keyHint: v.string(),
          needsNewKey: v.boolean(),
          updatedAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const settings = await settingsFor(ctx, userId);
    return {
      encryptionAvailable: encryptionSecretAvailable(env.AI_KEY_ENCRYPTION_SECRET),
      settings:
        settings === null
          ? null
          : {
              provider: settings.provider,
              model: settings.model ?? null,
              effectiveModel: settings.model ?? DEFAULT_ANTHROPIC_MODEL,
              keyHint: settings.keyHint,
              needsNewKey: settings.unreadableAt !== undefined,
              updatedAt: settings.updatedAt,
            },
    };
  },
});

/** Deletes the signed-in user's saved AI key. AI features turn off. */
export const remove = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const settings = await settingsFor(ctx, userId);
    if (settings !== null) await ctx.db.delete(settings._id);
    return null;
  },
});

/** Saves an already-encrypted key. Called only by the `save` action. */
export const store = internalMutation({
  args: {
    userId: v.id("users"),
    provider: aiProviderValidator,
    model: v.optional(v.string()),
    keyCiphertext: v.string(),
    keyIv: v.string(),
    keyHint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, ...fields }) => {
    const user = await ctx.db.get(userId);
    if (user === null || user.deletionRequestedAt !== undefined) {
      throw new Error("User was not found");
    }
    const now = Date.now();
    const existing = await settingsFor(ctx, userId);
    const values = {
      provider: fields.provider,
      model: fields.model,
      keyCiphertext: fields.keyCiphertext,
      keyIv: fields.keyIv,
      keyHint: fields.keyHint,
      keyScheme: AI_KEY_SCHEME,
      unreadableAt: undefined,
      updatedAt: now,
    } as const;
    if (existing === null) {
      await ctx.db.insert("aiSettings", { userId, ...values, createdAt: now });
    } else {
      await ctx.db.patch(existing._id, values);
    }
    return null;
  },
});

/** The stored, encrypted settings for server code that needs to decrypt them. */
export const encryptedForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      provider: aiProviderValidator,
      model: v.optional(v.string()),
      keyCiphertext: v.string(),
      keyIv: v.string(),
      unreadableAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const settings = await settingsFor(ctx, userId);
    if (settings === null) return null;
    return {
      provider: settings.provider,
      model: settings.model,
      keyCiphertext: settings.keyCiphertext,
      keyIv: settings.keyIv,
      unreadableAt: settings.unreadableAt,
    };
  },
});

/** The signed-in caller of the action that runs this, or null. */
export const callerId = internalQuery({
  args: {},
  returns: v.union(v.null(), v.id("users")),
  handler: async (ctx) => await getAuthUserId(ctx),
});

/** Records that the saved key no longer decrypts (for example, after the secret changed). */
export const markUnreadable = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const settings = await settingsFor(ctx, userId);
    if (settings !== null && settings.unreadableAt === undefined) {
      const now = Date.now();
      await ctx.db.patch(settings._id, { unreadableAt: now, updatedAt: now });
    }
    return null;
  },
});

type SavedSettings = { provider: AiProvider; model: string | null; keyHint: string };

/**
 * Validates and saves the signed-in user's provider, model and key. A blank
 * key keeps the saved one, but only for the same provider. The key is never
 * returned or logged; failures are `ConvexError({ code })`.
 */
export const save = action({
  args: {
    provider: aiProviderValidator,
    model: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  },
  returns: v.object({
    provider: aiProviderValidator,
    model: v.union(v.string(), v.null()),
    keyHint: v.string(),
  }),
  handler: async (ctx, args): Promise<SavedSettings> => {
    // Convex Auth 2.0's `getAuthUserId` is typed for query and mutation
    // contexts, so the action reads the caller through an internal query,
    // which runs with the caller's identity.
    const userId: Id<"users"> | null = await ctx.runQuery(internal.aiSettings.callerId, {});
    if (userId === null) throw new Error("Unauthenticated");
    try {
      const secret = env.AI_KEY_ENCRYPTION_SECRET;
      parseEncryptionSecret(secret);
      const model = normalizeModel(args.provider, args.model);
      const context = { userId, provider: args.provider };

      let apiKey = args.apiKey?.trim() ?? "";
      if (apiKey === "") {
        const existing: {
          provider: AiProvider;
          keyCiphertext: string;
          keyIv: string;
          unreadableAt?: number;
        } | null = await ctx.runQuery(internal.aiSettings.encryptedForUser, { userId });
        if (
          existing === null ||
          existing.provider !== args.provider ||
          existing.unreadableAt !== undefined
        ) {
          throw new AiSettingsError("ai_key_missing");
        }
        apiKey = await decryptApiKey(secret, existing, context);
      } else if (
        apiKey.length < MIN_KEY_LENGTH ||
        apiKey.length > MAX_KEY_LENGTH ||
        /\s/.test(apiKey)
      ) {
        throw new AiSettingsError("ai_key_malformed");
      }

      await checkProviderKey(resolveAiModelConfig({ provider: args.provider, model, apiKey }));
      const encrypted = await encryptApiKey(secret, apiKey, context);
      await ctx.runMutation(internal.aiSettings.store, {
        userId,
        provider: args.provider,
        ...(model === undefined ? {} : { model }),
        ...encrypted,
        keyHint: apiKeyHint(apiKey),
      });
      return { provider: args.provider, model: model ?? null, keyHint: apiKeyHint(apiKey) };
    } catch (error) {
      if (error instanceof AiSettingsError) throw new ConvexError({ code: error.code });
      throw error;
    }
  },
});
