import { describe, expect, it } from "vitest";
import { extractionFromJsonLd } from "./recipeJsonLd";

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", name: "Soup page" },
    {
      "@type": ["Recipe"],
      name: "Tomato &amp; Basil Soup",
      description: "<p>Bright and&nbsp;quick.</p>",
      author: [{ "@type": "Person", name: "Ada Cook" }],
      publisher: { "@type": "Organization", name: "Soup Site" },
      recipeYield: ["4", "4 servings"],
      prepTime: "PT15M",
      cookTime: "PT1H5M",
      totalTime: "PT0M",
      recipeCuisine: "Italian",
      recipeCategory: ["Soup", "Dinner"],
      keywords: "tomato, basil, tomato",
      recipeIngredient: [
        "2 tablespoons olive oil",
        "1 ½ pounds tomatoes, chopped",
        "fresh basil (optional)",
        "Salt",
      ],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Soup",
          itemListElement: [
            { "@type": "HowToStep", text: "1. Heat the oil." },
            { "@type": "HowToStep", text: "Add tomatoes &#38; simmer." },
          ],
        },
        { "@type": "HowToStep", name: "Serve hot." },
      ],
    },
  ],
};

describe("extractionFromJsonLd", () => {
  it("builds a complete extraction from a schema.org recipe in a graph", () => {
    const extraction = extractionFromJsonLd(JSON.stringify(graph));
    expect(extraction).toMatchObject({
      title: "Tomato & Basil Soup",
      description: "Bright and quick.",
      sourceSite: "Soup Site",
      sourceAuthor: "Ada Cook",
      yieldText: "4 servings",
      servings: 4,
      prepTimeMinutes: 15,
      cookTimeMinutes: 65,
      totalTimeMinutes: null,
      cuisines: ["Italian"],
      categories: ["Soup", "Dinner"],
      keywords: ["tomato", "basil"],
      warnings: [],
    });
    expect(extraction?.instructions).toEqual([
      { position: 1, text: "Heat the oil.", section: "Soup" },
      { position: 2, text: "Add tomatoes & simmer.", section: "Soup" },
      { position: 3, text: "Serve hot.", section: null },
    ]);
    expect(extraction?.ingredients).toMatchObject([
      {
        position: 1,
        originalText: "2 tablespoons olive oil",
        name: "olive oil",
        quantity: 2,
        unit: "tbsp",
        category: "Pantry",
        isOptional: false,
      },
      {
        name: "tomatoes",
        quantity: 1.5,
        quantityText: "1 1/2",
        unit: "lb",
        preparation: "chopped",
        category: "Produce",
      },
      { name: "fresh basil", isOptional: true, category: "Produce" },
      { name: "salt", quantity: null, category: "Spices & Seasonings" },
    ]);
  });

  it("splits a single instruction string into steps", () => {
    const extraction = extractionFromJsonLd(
      JSON.stringify({
        "@type": "Recipe",
        name: "Toast",
        recipeIngredient: ["1 slice bread"],
        recipeInstructions: "Toast the bread.\nButter it.",
      }),
    );
    expect(extraction?.instructions.map((step) => step.text)).toEqual([
      "Toast the bread.",
      "Butter it.",
    ]);
  });

  it("reads the page's per-serving nutrition, dropping unusable figures", () => {
    const base = {
      "@type": "Recipe",
      name: "Soup",
      recipeIngredient: ["1 cup stock"],
      recipeInstructions: ["Heat."],
    };
    const extraction = extractionFromJsonLd(
      JSON.stringify({
        ...base,
        nutrition: {
          "@type": "NutritionInformation",
          calories: "270 calories",
          proteinContent: "12 g",
          carbohydrateContent: "lots",
          fatContent: "-3 g",
          sodiumContent: "1.2 g",
        },
      }),
    );
    expect(extraction?.nutrition).toEqual({ calories: 270, proteinG: 12, sodiumMg: 1200 });

    const withoutFigures = extractionFromJsonLd(
      JSON.stringify({ ...base, nutrition: { calories: "N/A" } }),
    );
    expect(withoutFigures).not.toBeNull();
    expect(withoutFigures).not.toHaveProperty("nutrition");
    expect(extractionFromJsonLd(JSON.stringify(base))).not.toHaveProperty("nutrition");
  });

  it("returns null so the model runs when the recipe is incomplete", () => {
    const base = {
      "@type": "Recipe",
      name: "Soup",
      recipeIngredient: ["1 cup stock"],
      recipeInstructions: ["Heat."],
    };
    expect(extractionFromJsonLd(JSON.stringify(base))).not.toBeNull();
    expect(
      extractionFromJsonLd(JSON.stringify({ ...base, recipeIngredient: [] })),
    ).toBeNull();
    expect(
      extractionFromJsonLd(JSON.stringify({ ...base, recipeInstructions: undefined })),
    ).toBeNull();
    expect(extractionFromJsonLd(JSON.stringify({ ...base, name: " " }))).toBeNull();
    expect(extractionFromJsonLd(JSON.stringify({ "@type": "Article" }))).toBeNull();
    expect(extractionFromJsonLd('{"@type":"Recipe","name":"Trunc')).toBeNull();
  });
});
