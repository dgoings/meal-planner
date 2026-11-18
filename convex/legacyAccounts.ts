import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";

// One-off tooling for the move to Convex Auth 2.0, which does not carry v1
// credentials over. Each v1 user signs up again with the same email, and an
// operator then moves the old row's data onto the new account from the
// Convex dashboard or `npx convex run`. Delete this module once every legacy
// row is gone.

const BATCH_SIZE = 100;
const MAX_LEGACY_SCAN = 500;

async function verifiedEmailsOf(ctx: QueryCtx, userId: Id<"users">) {
  const emails = await ctx.runQuery(components.authEmail.verifiedEmails.getEmails, { userId });
  return emails.map(({ email }) => email.trim().toLowerCase());
}

/**
 * Users left from Convex Auth v1: they have an email but no verified email
 * in the auth component. `newUserId` is the account that has since
 * confirmed the same address, or null if its owner has not signed up again.
 */
export const listLegacyAccounts = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      email: v.string(),
      legacyUserId: v.id("users"),
      newUserId: v.union(v.id("users"), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(MAX_LEGACY_SCAN);
    const legacy = [];
    for (const user of users) {
      if (user.email === undefined || user.deletionStage !== undefined) continue;
      if ((await verifiedEmailsOf(ctx, user._id)).length > 0) continue;
      const email = user.email;
      const sameEmail = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .take(10);
      let newUserId: Id<"users"> | null = null;
      for (const candidate of sameEmail) {
        if (candidate._id === user._id) continue;
        if ((await verifiedEmailsOf(ctx, candidate._id)).includes(email)) {
          newUserId = candidate._id;
          break;
        }
      }
      legacy.push({ email, legacyUserId: user._id, newUserId });
    }
    return legacy;
  },
});

/**
 * Moves a v1 user's data onto the account its owner created after the move
 * to Convex Auth 2.0, then deletes the v1 row. Refuses unless the new
 * account has confirmed the v1 row's email, so a mistyped id cannot hand
 * one person's data to another.
 */
export const moveLegacyAccount = internalMutation({
  args: { legacyUserId: v.id("users"), newUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { legacyUserId, newUserId }) => {
    if (legacyUserId === newUserId) throw new Error("The two ids are the same user");
    const [legacyUser, newUser] = await Promise.all([ctx.db.get(legacyUserId), ctx.db.get(newUserId)]);
    if (legacyUser === null) throw new Error("Legacy user not found");
    if (newUser === null) throw new Error("New user not found");
    if (legacyUser.email === undefined) throw new Error("Legacy user has no email to match");
    if ((await verifiedEmailsOf(ctx, legacyUserId)).length > 0) {
      throw new Error("Legacy user already has a verified Convex Auth 2.0 email");
    }
    if (!(await verifiedEmailsOf(ctx, newUserId)).includes(legacyUser.email)) {
      throw new Error("New user has not confirmed the legacy user's email");
    }
    if (legacyUser.deletionStage !== undefined || newUser.deletionStage !== undefined) {
      throw new Error("One of the users is being deleted");
    }

    await ctx.db.patch(newUserId, {
      name: newUser.name ?? legacyUser.name,
      image: newUser.image ?? legacyUser.image,
      createdAt: legacyUser.createdAt ?? legacyUser._creationTime,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.legacyAccounts.moveLegacyAccountBatch, {
      legacyUserId,
      newUserId,
    });
    return null;
  },
});

export const moveLegacyAccountBatch = internalMutation({
  args: { legacyUserId: v.id("users"), newUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { legacyUserId, newUserId }) => {
    const [saved, inboxes, inbound, imports, lists] = await Promise.all([
      ctx.db.query("savedRecipes").withIndex("by_user", (q) => q.eq("userId", legacyUserId)).take(BATCH_SIZE),
      ctx.db.query("userInboxes").withIndex("by_user", (q) => q.eq("userId", legacyUserId)).take(BATCH_SIZE),
      ctx.db.query("inboundRecipeEmails").withIndex("by_user", (q) => q.eq("userId", legacyUserId)).take(BATCH_SIZE),
      ctx.db.query("recipeImports").withIndex("by_requester", (q) => q.eq("requestedBy", legacyUserId)).take(BATCH_SIZE),
      ctx.db.query("groceryLists").withIndex("by_user", (q) => q.eq("userId", legacyUserId)).take(BATCH_SIZE),
    ]);

    for (const save of saved) {
      // The v1 save carries the user's notes and favorite, so it wins over a
      // save of the same recipe made after signing up again.
      const duplicate = await ctx.db
        .query("savedRecipes")
        .withIndex("by_user_and_recipe", (q) => q.eq("userId", newUserId).eq("recipeId", save.recipeId))
        .first();
      if (duplicate !== null) await ctx.db.delete(duplicate._id);
      await ctx.db.patch(save._id, { userId: newUserId });
    }
    for (const inbox of inboxes) await ctx.db.patch(inbox._id, { userId: newUserId });
    for (const email of inbound) await ctx.db.patch(email._id, { userId: newUserId });
    for (const item of imports) await ctx.db.patch(item._id, { requestedBy: newUserId });
    for (const list of lists) await ctx.db.patch(list._id, { userId: newUserId });

    const moved = saved.length + inboxes.length + inbound.length + imports.length + lists.length;
    if (moved > 0) {
      await ctx.scheduler.runAfter(0, internal.legacyAccounts.moveLegacyAccountBatch, {
        legacyUserId,
        newUserId,
      });
    } else {
      await ctx.db.delete(legacyUserId);
    }
    return null;
  },
});
