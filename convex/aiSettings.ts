import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { AI_KEY_SCHEME, encryptionSecretAvailable } from "./lib/aiKeyCrypto";
import { DEFAULT_ANTHROPIC_MODEL } from "./lib/aiModel";
import { aiProviderValidator } from "./lib/aiValidators";

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
