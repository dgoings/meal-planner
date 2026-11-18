import { describe, expect, it } from "vitest";
import { extractionFromModelOutput, type ModelRecipeExtraction } from "./recipeAgentTypes";

const output: ModelRecipeExtraction = {
  title: "Soup",
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
  instructions: [{ position: 1, text: "Heat.", section: null }],
  ingredients: [],
  nutrition: null,
  warnings: [],
};

describe("extractionFromModelOutput", () => {
  it("keeps the figures the model copied and drops unusable ones", () => {
    const extraction = extractionFromModelOutput({
      ...output,
      nutrition: { calories: 320, proteinG: 18, carbsG: null, fatG: -2, sodiumMg: 900_000 },
    });
    expect(extraction.nutrition).toEqual({ calories: 320, proteinG: 18 });
  });

  it("leaves nutrition out when the page stated none", () => {
    expect(extractionFromModelOutput(output)).not.toHaveProperty("nutrition");
    expect(
      extractionFromModelOutput({ ...output, nutrition: { calories: null, proteinG: null } }),
    ).not.toHaveProperty("nutrition");
  });
});
