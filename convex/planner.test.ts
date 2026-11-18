import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertUserRecipe } from "./lib/userRecipes";
import { startSlotImport } from "./planner";
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

async function slotOf(t: AuthTest, plannerId: Id<"planners">, date: string, meal: "lunch" | "dinner") {
  return await t.run((ctx) =>
    ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).eq("date", date).eq("meal", meal))
      .unique(),
  );
}

async function recipesOf(t: AuthTest, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const saved = await ctx.db.query("savedRecipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return await Promise.all(saved.map(async (item) => (await ctx.db.get(item.recipeId))!));
  });
}

describe("commitText", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;

  it("links a saved recipe by its normalised name instead of creating one", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "  CHILI!! " })).toEqual({ type: "cook", name: "Chili" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", recipeId: chili });
    expect(await recipesOf(t, userId)).toHaveLength(1);
  });

  it("creates one bare recipe for a new name and reuses it", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Lentil soup" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "dinner", text: "lentil SOUP" });
    const recipes = await recipesOf(t, userId);
    expect(recipes.map((recipe) => recipe.title)).toEqual(["Lentil soup"]);
    expect(await slotOf(t, plannerId, "2026-11-19", "dinner")).toMatchObject({ recipeId: recipes[0]._id });
  });

  it("does not match another user's recipe or a deleted one", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await t.run((ctx) => insertUserRecipe(ctx, grace.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const deleted = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Stew", ingredients: [], instructions: [] }));
    await t.run((ctx) => ctx.db.patch(deleted, { deletedAt: Date.now() }));

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "dinner", text: "Stew" });
    const titles = (await recipesOf(t, userId)).filter((recipe) => recipe.deletedAt === undefined).map((recipe) => recipe.title);
    expect(titles.sort()).toEqual(["Chili", "Stew"]);
    expect((await slotOf(t, plannerId, "2026-11-18", "dinner"))).not.toMatchObject({ recipeId: deleted });
  });

  it("sets the type from typed text in an unplanned slot", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "out at Chipotle" })).toEqual({ type: "out", name: "Chipotle" });
    expect(await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "lunch", text: "out chipotle" })).toEqual({ type: "out", name: "Chipotle" });
    const first = await slotOf(t, plannerId, lunch.date, lunch.meal);
    const second = await slotOf(t, plannerId, "2026-11-19", "lunch");
    expect(first?.type === "out" && second?.type === "out" && first.mealId === second.mealId && first.mealId !== undefined).toBe(true);

    expect(await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "dinner", text: "skip" })).toEqual({ type: "skip", name: "" });
    expect(await slotOf(t, plannerId, "2026-11-18", "dinner")).toMatchObject({ type: "skip" });
  });

  it("points typed leftovers at the newest earlier meal, or other leftovers", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "dinner", text: "Curry" });

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "leftovers" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "left", from: { date: "2026-11-17", meal: "dinner" } });

    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-10", meal: "lunch", text: "Left over" });
    expect(await slotOf(t, plannerId, "2026-11-10", "lunch")).toMatchObject({ type: "left", from: "other" });
  });

  it("keeps the type of a planned slot, and empty text unlinks the recipe", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "skip" })).toEqual({ type: "cook", name: "skip" });

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "" })).toEqual({ type: "cook", name: "" });
    const slot = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(slot).toMatchObject({ type: "cook" });
    expect(slot?.type === "cook" && slot.recipeId).toBeFalsy();
    expect((await recipesOf(t, userId)).map((recipe) => recipe.title).sort()).toEqual(["Chili", "skip"]);
  });

  it("does nothing when the text equals the current name", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    const before = await slotOf(t, plannerId, lunch.date, lunch.meal);
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: " Chili " });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toEqual(before);
  });

  it("rejects links, slots without text, bad dates and other users", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await expect(as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "https://example.com/chili" })).rejects.toThrow(/importLink/);
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "skip" });
    await expect(as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" })).rejects.toThrow(/no text/);
    await expect(as.mutation(api.planner.commitText, { plannerId, date: "2026-02-30", meal: "lunch", text: "Chili" })).rejects.toThrow(/Invalid date/);
    const grace = await signedInUser(t, "grace@example.com");
    await expect(grace.as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" })).rejects.toThrow(/Planner was not found/);
  });
});

describe("setType", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;

  it("clears the slot when the selected type is pressed again", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "cook" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook" });
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "cook" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toBeNull();
  });

  it("carries the name between Cook and Eat out", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "out" });
    const out = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(out?.type).toBe("out");
    const meal = await t.run(async (ctx) => (out?.type === "out" && out.mealId ? ctx.db.get(out.mealId) : null));
    expect(meal?.name).toBe("Chili");

    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "lunch", text: "out Tacos" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-19", meal: "lunch", type: "cook" });
    const titles = (await recipesOf(t, userId)).map((recipe) => recipe.title).sort();
    expect(titles).toEqual(["Chili", "Tacos"]);
  });

  it("drops the name for Skip and picks the newest source for Leftovers across weeks", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-15", meal: "dinner", text: "Roast" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });

    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-16", meal: "lunch", type: "skip" });
    expect(await slotOf(t, plannerId, "2026-11-16", "lunch")).toMatchObject({ type: "skip" });

    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-16", meal: "lunch", type: "left" });
    expect(await slotOf(t, plannerId, "2026-11-16", "lunch")).toMatchObject({
      type: "left",
      from: { date: "2026-11-15", meal: "dinner" },
    });
  });
});

describe("leftovers", () => {
  const dinner = { date: "2026-11-18", meal: "dinner" } as const;

  async function setup() {
    const t = initAuthTest();
    const user = await plannerFor(t, "ada@example.com");
    const { as, plannerId } = user;
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "lunch", text: "Soup" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Curry" });
    await as.mutation(api.planner.commitText, { plannerId, ...dinner, text: "leftovers" });
    return { t, ...user };
  }

  it("chooses an offered source", async () => {
    const { t, as, plannerId } = await setup();
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toMatchObject({ from: { date: "2026-11-18", meal: "lunch" } });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: { date: "2026-11-16", meal: "dinner" } });
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toMatchObject({ from: { date: "2026-11-16", meal: "dinner" } });
  });

  it("rejects sources that are not offered", async () => {
    const { as, plannerId } = await setup();
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-11", meal: "dinner", text: "Old" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "lunch", text: "Later" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "lunch", text: "skip" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-17", meal: "dinner", type: "cook" });
    for (const from of [
      { date: "2026-11-11", meal: "dinner" },
      { date: "2026-11-19", meal: "lunch" },
      { date: "2026-11-17", meal: "lunch" },
      { date: "2026-11-17", meal: "dinner" },
    ] as const) {
      await expect(as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from })).rejects.toThrow(/can’t be used as leftovers/);
    }
  });

  it("names other leftovers and keeps that name only while the slot stays other", async () => {
    const { t, as, plannerId } = await setup();
    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: "other" });
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toMatchObject({ from: "other" });

    expect(await as.mutation(api.planner.commitOther, { plannerId, ...dinner, text: "Pizza" })).toEqual({ name: "Pizza" });
    const named = await slotOf(t, plannerId, dinner.date, dinner.meal);
    expect(named?.type === "left" && named.mealId).toBeTruthy();

    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: "other" });
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toEqual(expect.objectContaining({ mealId: named?.type === "left" ? named.mealId : undefined }));

    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: { date: "2026-11-18", meal: "lunch" } });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: "other" });
    const reset = await slotOf(t, plannerId, dinner.date, dinner.meal);
    expect(reset?.type === "left" && reset.mealId).toBeFalsy();

    expect(await as.mutation(api.planner.commitOther, { plannerId, ...dinner, text: "pizza" })).toEqual({ name: "Pizza" });
    const meals = await t.run((ctx) => ctx.db.query("plannerMeals").collect());
    expect(meals.map((meal) => meal.name)).toEqual(["Pizza"]);
  });

  it("only works on a leftovers slot", async () => {
    const { as, plannerId } = await setup();
    const lunch = { date: "2026-11-18", meal: "lunch" } as const;
    await expect(as.mutation(api.planner.setLeftoverOf, { plannerId, ...lunch, from: "other" })).rejects.toThrow(/not leftovers/);
    await expect(as.mutation(api.planner.commitOther, { plannerId, ...lunch, text: "Pizza" })).rejects.toThrow(/not leftovers/);
  });
});

describe("week and suggestions queries", () => {
  it("returns resolved slots from six days before to six days after the start", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    for (const [date, text] of [["2026-11-10", "Six before"], ["2026-11-09", "Seven before"], ["2026-11-23", "Seven after"]] as const) {
      await as.mutation(api.planner.commitText, { plannerId, date, meal: "lunch", text });
    }
    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots.map((slot) => slot.name)).toEqual(["Six before"]);
  });

  it("shows recipe details, planner meal names and leftover sources", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "out Thai" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "lunch", text: "leftovers" });
    const chili = await slotOf(t, plannerId, "2026-11-16", "lunch");
    const recipeId = chili?.type === "cook" ? chili.recipeId! : (null as never);
    await as.mutation(api.recipeCards.addIngredient, { recipeId, name: "beans" });
    await as.mutation(api.recipeCards.addIngredient, { recipeId, name: "tomatoes" });

    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots).toEqual([
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili", recipe: { recipeId, ingredientCount: 2, available: true } },
      { date: "2026-11-16", meal: "dinner", type: "out", name: "Thai" },
      { date: "2026-11-17", meal: "lunch", type: "left", name: "", from: { date: "2026-11-16", meal: "dinner" } },
    ]);

    await as.mutation(api.recipeCards.removeCard, { recipeId });
    const after = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(after.slots[0]).toMatchObject({ name: "Chili", recipe: { recipeId, ingredientCount: 0, available: false } });
  });

  it("suggests saved recipes and planner meals once each, sorted", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "out chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "out Bao" });
    expect(await as.query(api.planner.suggestions, { plannerId })).toEqual(["Bao", "Chili"]);
  });

  it("rejects anonymous callers and other users", async () => {
    const t = initAuthTest();
    const { plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await expect(t.query(api.planner.week, { plannerId, start: "2026-11-16" })).rejects.toThrow(/Unauthenticated/);
    await expect(grace.as.query(api.planner.week, { plannerId, start: "2026-11-16" })).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.query(api.planner.suggestions, { plannerId })).rejects.toThrow(/Planner was not found/);
  });
});

describe("importing a recipe link into a slot", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;
  const url = "https://www.example.com/recipes/12345-best-chili.html";

  it("starts the existing import and shows the slot as pending until the recipe is saved", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const start = vi.fn().mockResolvedValue("workflow-1");
    const importId = await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url }, start));
    expect(start).toHaveBeenCalledTimes(1);
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", importId, importName: "Best chili" });

    const again = await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, date: "2026-11-19", meal: "lunch", url }, start));
    expect(again).toBe(importId);
    expect(start).toHaveBeenCalledTimes(1);

    let week = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(week.slots[0]).toEqual({ ...lunch, type: "cook", name: "Best chili", import: { importId, status: "queued" } });

    const recipeId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recipes", {
        importId,
        sourceUrl: url,
        normalizedSourceUrl: url,
        title: "The Best Chili",
        cuisines: [],
        categories: [],
        keywords: [],
        instructions: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(importId, { recipeId: id, status: "completed" });
      return id;
    });
    week = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(week.slots[0]).toEqual({ ...lunch, type: "cook", name: "Best chili", import: { importId, status: "completed", recipeId } });

    await as.mutation(api.recipeCards.addToBook, { recipeId });
    week = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(week.slots[0]).toEqual({
      ...lunch,
      type: "cook",
      name: "The Best Chili",
      recipe: { recipeId, ingredientCount: 0, available: true },
    });
  });

  it("lets a pending import be a leftovers source and clears it when the slot changes", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url }, vi.fn().mockResolvedValue("wf")));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "dinner", text: "leftovers" });
    expect(await slotOf(t, plannerId, "2026-11-18", "dinner")).toMatchObject({ from: lunch });

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Tacos" });
    const slot = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(slot).not.toHaveProperty("importId");
  });

  it("rejects text that is not a link and other users' planners", async () => {
    const t = initAuthTest();
    const { userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const start = vi.fn().mockResolvedValue("wf");
    await expect(t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url: "Chili" }, start))).rejects.toThrow(/Not a recipe link/);
    await expect(t.run((ctx) => startSlotImport(ctx, grace.userId, { plannerId, ...lunch, url }, start))).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.mutation(api.planner.importLink, { plannerId, ...lunch, url })).rejects.toThrow(/Planner was not found/);
  });
});
