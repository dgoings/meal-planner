import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { insertUserRecipe } from "./lib/userRecipes";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

async function plannerFor(t: AuthTest, email: string) {
  const user = await signedInUser(t, email);
  const plannerId = await user.as.mutation(api.planner.ensure, {});
  return { ...user, plannerId };
}

describe("insertUserRecipe", () => {
  it("creates a bare recipe its creator owns and can fill in", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const recipeId = await t.run((ctx) =>
      insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: [], instructions: [] }),
    );

    expect(await ada.as.query(api.recipes.listBook, {})).toEqual([
      expect.objectContaining({ _id: recipeId, title: "Chili", sourceSite: "Manual recipe" }),
    ]);
    expect(await ada.as.query(api.recipes.get, { recipeId })).toMatchObject({
      canEdit: true,
      ingredients: [],
      recipe: { instructions: [] },
    });
    await ada.as.mutation(api.recipeCards.addIngredient, { recipeId, name: "beans" });
    expect(await grace.as.query(api.recipes.get, { recipeId })).toBeNull();
  });
});

describe("planner access and preferences", () => {
  it("rejects anonymous callers", async () => {
    const t = initAuthTest();
    await expect(t.query(api.planner.mine, {})).rejects.toThrow(/Unauthenticated/);
    await expect(t.mutation(api.planner.ensure, {})).rejects.toThrow(/Unauthenticated/);
  });

  it("creates one planner per account with default preferences", async () => {
    const t = initAuthTest();
    const { as, userId } = await signedInUser(t, "ada@example.com");
    expect(await as.query(api.planner.mine, {})).toBeNull();

    const first = await as.mutation(api.planner.ensure, {});
    const second = await as.mutation(api.planner.ensure, {});
    expect(second).toBe(first);
    expect(await as.query(api.planner.mine, {})).toEqual({ plannerId: first, weekStart: 1, people: 1 });
    await t.run(async (ctx) => {
      const planners = await ctx.db.query("planners").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
      expect(planners).toHaveLength(1);
    });
  });

  it("saves the week start and rounds and clamps people cooked for", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");

    await as.mutation(api.planner.updatePreferences, { plannerId, weekStart: 6 });
    expect(await as.query(api.planner.mine, {})).toMatchObject({ weekStart: 6, people: 1 });

    for (const [people, expected] of [[3.6, 4], [0, 1], [40, 12], [Number.NaN, 1]] as const) {
      await as.mutation(api.planner.updatePreferences, { plannerId, people });
      expect(await as.query(api.planner.mine, {})).toMatchObject({ weekStart: 6, people: expected });
    }
  });

  it("does not let another user change a planner", async () => {
    const t = initAuthTest();
    const { plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await expect(
      grace.as.mutation(api.planner.updatePreferences, { plannerId, people: 2 }),
    ).rejects.toThrow(/Planner was not found/);
  });
});
