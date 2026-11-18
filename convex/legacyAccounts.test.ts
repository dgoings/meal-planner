import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function createLegacyUser(t: AuthTest, email: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", { name: "Ana Legacy", email, createdAt: 1 }),
  );
}

async function createRecipe(t: AuthTest, title: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("recipes", {
      sourceUrl: `https://example.com/${title}`,
      normalizedSourceUrl: `https://example.com/${title}`,
      isPublic: true,
      title,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [],
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function seedLegacyData(t: AuthTest, legacyUserId: Id<"users">, recipeId: Id<"recipes">) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("savedRecipes", {
      userId: legacyUserId,
      recipeId,
      notes: "Double the garlic",
      isFavorite: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("groceryLists", {
      userId: legacyUserId,
      name: "Weeknight",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("recipeImports", {
      requestedBy: legacyUserId,
      sourceUrl: "https://example.com/soup",
      normalizedUrl: "https://example.com/soup",
      status: "completed",
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("inboundRecipeEmails", {
      userId: legacyUserId,
      inboxId: "inbox",
      eventId: "event-1",
      receivedAt: now,
      linkCount: 1,
      queuedCount: 1,
    });
  });
}

describe("legacy account moves", () => {
  it("lists v1 rows and pairs them with the account that confirmed the same email", async () => {
    const t = initAuthTest();
    const legacyUserId = await createLegacyUser(t, "ana@example.com");
    const waitingUserId = await createLegacyUser(t, "bo@example.com");
    const { userId: newUserId } = await signedInUser(t, "ana@example.com");

    const listed = await t.query(internal.legacyAccounts.listLegacyAccounts, {});
    expect(listed).toEqual(
      expect.arrayContaining([
        { email: "ana@example.com", legacyUserId, newUserId },
        { email: "bo@example.com", legacyUserId: waitingUserId, newUserId: null },
      ]),
    );
    expect(listed).toHaveLength(2);
  });

  it("moves every user-owned row to the new account and deletes the v1 row", async () => {
    const t = initAuthTest();
    const legacyUserId = await createLegacyUser(t, "ana@example.com");
    const recipeId = await createRecipe(t, "soup");
    await seedLegacyData(t, legacyUserId, recipeId);
    const { userId: newUserId } = await signedInUser(t, "ana@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("savedRecipes", {
        userId: newUserId,
        recipeId,
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.legacyAccounts.moveLegacyAccount, { legacyUserId, newUserId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.run(async (ctx) => {
      expect(await ctx.db.get(legacyUserId)).toBeNull();
      const newUser = await ctx.db.get(newUserId);
      expect(newUser).toMatchObject({ name: "Ana Legacy", email: "ana@example.com", createdAt: 1 });

      const saved = await ctx.db.query("savedRecipes").collect();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ userId: newUserId, notes: "Double the garlic", isFavorite: true });

      const lists = await ctx.db.query("groceryLists").collect();
      expect(lists.map((list) => list.userId)).toEqual([newUserId]);
      const imports = await ctx.db.query("recipeImports").collect();
      expect(imports.map((item) => item.requestedBy)).toEqual([newUserId]);
      const inbound = await ctx.db.query("inboundRecipeEmails").collect();
      expect(inbound.map((email) => email.userId)).toEqual([newUserId]);
    });
  });

  it("refuses to move data to an account that has not confirmed the v1 email", async () => {
    const t = initAuthTest();
    const legacyUserId = await createLegacyUser(t, "ana@example.com");
    const { userId: otherUserId } = await signedInUser(t, "someone-else@example.com");

    await expect(
      t.mutation(internal.legacyAccounts.moveLegacyAccount, { legacyUserId, newUserId: otherUserId }),
    ).rejects.toThrow("New user has not confirmed the legacy user's email");
    expect(await t.run(async (ctx) => ctx.db.get(legacyUserId))).not.toBeNull();
  });

  it("refuses to treat a Convex Auth 2.0 account as the v1 row", async () => {
    const t = initAuthTest();
    const { userId: newUserId } = await signedInUser(t, "ana@example.com");
    const { userId: otherUserId } = await signedInUser(t, "bo@example.com");

    await expect(
      t.mutation(internal.legacyAccounts.moveLegacyAccount, {
        legacyUserId: otherUserId,
        newUserId,
      }),
    ).rejects.toThrow("Legacy user already has a verified Convex Auth 2.0 email");
  });
});
