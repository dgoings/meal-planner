import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { RecipeExtraction } from "./lib/recipeAgentTypes";
import { insertUserRecipe } from "./lib/userRecipes";
import { initAuthTest, signedInUser, TEST_AI_KEY_SECRET, type AuthTest } from "./testing.helpers";

beforeEach(() => {
  vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", TEST_AI_KEY_SECRET);
});

const extraction: RecipeExtraction = {
  title: "Lentil Soup",
  description: null,
  sourceSite: null,
  sourceAuthor: null,
  yieldText: null,
  servings: 4,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  totalTimeMinutes: null,
  cuisines: [],
  categories: [],
  keywords: [],
  instructions: [{ position: 1, text: "Simmer.", section: null }],
  ingredients: [
    {
      position: 1,
      section: null,
      originalText: "1 cup lentils",
      name: "lentils",
      normalizedName: "lentils",
      quantity: 1,
      quantityText: "1",
      unit: "cup",
      preparation: null,
      notes: null,
      category: "Pantry",
      isOptional: false,
    },
  ],
  warnings: [],
};

/** A scraped import owned by `userId`, ready for `persistGeneratedRecipe`. */
async function scrapedImport(t: AuthTest, userId: Id<"users">, sourceUrl = "https://example.com/lentil-soup") {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const importId = await ctx.db.insert("recipeImports", {
      requestedBy: userId,
      sourceUrl,
      normalizedUrl: sourceUrl,
      sourceKind: "direct",
      status: "processing",
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("recipeScrapeArtifacts", {
      importId,
      sourceUrl,
      normalizedUrl: sourceUrl,
      markdown: "# Lentil soup",
      truncated: false,
      scrapedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return importId;
  });
}

describe("importing nutrition", () => {
  it("stores the page's figures with source page, dropping unusable ones", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const importId = await scrapedImport(t, ada.userId);
    const { recipeId } = await t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
      importId,
      model: "test-model",
      extraction: { ...extraction, nutrition: { calories: 320, proteinG: 18, fatG: -1, sodiumMg: 50_000 } },
    });
    expect((await t.run((ctx) => ctx.db.get(recipeId)))?.nutritionPerServing).toEqual({
      calories: 320,
      proteinG: 18,
      source: "page",
    });
    expect((await ada.as.query(api.recipes.get, { recipeId }))?.recipe.nutritionPerServing).toEqual({
      calories: 320,
      proteinG: 18,
      source: "page",
    });
  });

  it("imports a recipe without nutrition, or with none usable, and leaves the field out", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const plain = await t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
      importId: await scrapedImport(t, ada.userId),
      model: "test-model",
      extraction,
    });
    const unusable = await t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
      importId: await scrapedImport(t, ada.userId, "https://example.com/other"),
      model: "test-model",
      extraction: { ...extraction, nutrition: { calories: -5 } },
    });
    for (const { recipeId } of [plain, unusable]) {
      const recipe = await t.run((ctx) => ctx.db.get(recipeId));
      expect(recipe).not.toBeNull();
      expect(recipe).not.toHaveProperty("nutritionPerServing");
    }
  });

  it("still serves a cached extraction saved before nutrition existed", async () => {
    const t = initAuthTest();
    const normalizedUrl = "https://example.com/old-cache";
    await t.run((ctx) =>
      ctx.db.insert("recipeExtractions", { normalizedUrl, model: "test-model", extraction, createdAt: Date.now() }),
    );
    const cached = await t.query(internal.recipeAgentData.cachedExtraction, { normalizedUrl });
    expect(cached?.extraction.title).toBe("Lentil Soup");
    expect(cached?.extraction).not.toHaveProperty("nutrition");
  });
});

describe("reading nutrition", () => {
  it("returns legacy text figures as numbers from the page, without the legacy field", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const recipeId = await t.run(async (ctx) => {
      const id = await insertUserRecipe(ctx, ada.userId, { title: "Old", ingredients: [], instructions: [] });
      await ctx.db.patch(id, { nutrition: { servingSize: "1 bowl", calories: "410 kcal", protein: "14 g", sodium: "0.3 g" } });
      return id;
    });
    const data = await ada.as.query(api.recipes.get, { recipeId });
    expect(data?.recipe.nutritionPerServing).toEqual({ calories: 410, proteinG: 14, sodiumMg: 300, source: "page" });
    expect(data?.recipe).not.toHaveProperty("nutrition");
    const book = await ada.as.query(api.recipes.listBook, {});
    expect(book[0]?.nutritionPerServing).toEqual({ calories: 410, proteinG: 14, sodiumMg: 300, source: "page" });
  });
});

describe("editing nutrition", () => {
  it("lets the owner set figures by hand, as manual, and clear them all", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const recipeId = await t.run(async (ctx) => {
      const id = await insertUserRecipe(ctx, ada.userId, { title: "Soup", ingredients: [], instructions: [] });
      await ctx.db.patch(id, {
        nutrition: { calories: "410 kcal" },
        nutritionPerServing: { calories: 300, fatG: 9, source: "page" },
      });
      return id;
    });

    await ada.as.mutation(api.recipeCards.setNutrition, { recipeId, figures: { calories: 350, proteinG: 21.25 } });
    const edited = await t.run((ctx) => ctx.db.get(recipeId));
    expect(edited?.nutritionPerServing).toEqual({ calories: 350, proteinG: 21.3, source: "manual" });
    // Saving by hand also removes the legacy text, so clearing later really clears.
    expect(edited).not.toHaveProperty("nutrition");

    await ada.as.mutation(api.recipeCards.setNutrition, { recipeId, figures: {} });
    const cleared = await t.run((ctx) => ctx.db.get(recipeId));
    expect(cleared).not.toHaveProperty("nutritionPerServing");
    expect((await ada.as.query(api.recipes.get, { recipeId }))?.recipe).not.toHaveProperty("nutritionPerServing");
  });

  it("refuses figures out of range and anyone but the owner", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const recipeId = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Soup", ingredients: [], instructions: [] }));
    await expect(ada.as.mutation(api.recipeCards.setNutrition, { recipeId, figures: { calories: -1 } })).rejects.toThrow(/Calories/);
    await expect(ada.as.mutation(api.recipeCards.setNutrition, { recipeId, figures: { sodiumMg: 99_999 } })).rejects.toThrow(/Sodium/);
    await expect(grace.as.mutation(api.recipeCards.setNutrition, { recipeId, figures: { calories: 300 } })).rejects.toThrow(/Forbidden/);
    expect(await t.run((ctx) => ctx.db.get(recipeId))).not.toHaveProperty("nutritionPerServing");
  });
});

describe("importing a link into an existing recipe", () => {
  it("carries the imported recipe's nutrition across, and keeps the recipe's own when the import has none", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const target = await t.run(async (ctx) => {
      const id = await insertUserRecipe(ctx, ada.userId, { title: "Soup", ingredients: [], instructions: [] });
      await ctx.db.patch(id, { nutritionPerServing: { calories: 999, source: "manual" } });
      return id;
    });
    const withFigures = await t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
      importId: await scrapedImport(t, ada.userId),
      model: "test-model",
      extraction: { ...extraction, nutrition: { calories: 320, fiberG: 6 } },
    });
    const importId = (await t.run((ctx) => ctx.db.get(withFigures.recipeId)))!.importId!;
    await ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: target, importId, useImportedTitle: false, replaceExisting: true });
    expect((await t.run((ctx) => ctx.db.get(target)))?.nutritionPerServing).toEqual({ calories: 320, fiberG: 6, source: "page" });

    const without = await t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
      importId: await scrapedImport(t, ada.userId, "https://example.com/plain"),
      model: "test-model",
      extraction,
    });
    const plainImport = (await t.run((ctx) => ctx.db.get(without.recipeId)))!.importId!;
    await ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: target, importId: plainImport, useImportedTitle: false, replaceExisting: true });
    expect((await t.run((ctx) => ctx.db.get(target)))?.nutritionPerServing).toEqual({ calories: 320, fiberG: 6, source: "page" });
  });
});
