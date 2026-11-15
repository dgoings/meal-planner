import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const BATCH_SIZE = 100;

// Accounts created before email confirmation was required are treated as
// confirmed so they are not interrupted at sign-in and their forwarded recipes
// keep importing. `createdBefore` keeps the migration from confirming accounts
// that signed up after the requirement shipped.
export const grandfatherEmailVerification = internalMutation({
  args: {
    createdBefore: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ users: v.number(), accounts: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const createdBefore = args.createdBefore ?? Date.now();
    const page = await ctx.db
      .query("users")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let users = 0;
    let accounts = 0;
    for (const user of page.page) {
      if (user._creationTime >= createdBefore || !user.email) continue;
      if (user.emailVerificationTime === undefined) {
        await ctx.db.patch(user._id, { emailVerificationTime: Date.now() });
        users += 1;
      }
      const passwordAccount = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", user._id).eq("provider", "password"),
        )
        .unique();
      if (passwordAccount !== null && passwordAccount.emailVerified === undefined) {
        await ctx.db.patch(passwordAccount._id, {
          emailVerified: passwordAccount.providerAccountId,
        });
        accounts += 1;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migrations.grandfatherEmailVerification,
        { createdBefore, cursor: page.continueCursor },
      );
    }
    return { users, accounts, done: page.isDone };
  },
});
