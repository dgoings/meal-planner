import { describe, expect, it } from "vitest";
import {
  hasNutritionFigures,
  nutritionFromFigures,
  nutritionFromSchemaOrg,
  parseNutrientFigure,
  readRecipeNutrition,
  sanitizeNutritionFigures,
} from "./nutrition";

describe("parseNutrientFigure", () => {
  it("reads calories written several ways", () => {
    expect(parseNutrientFigure("270 calories", "calories")).toBe(270);
    expect(parseNutrientFigure("410 kcal", "calories")).toBe(410);
    expect(parseNutrientFigure("Calories: 1,250", "calories")).toBe(1250);
    expect(parseNutrientFigure(320, "calories")).toBe(320);
    expect(parseNutrientFigure("1046 kJ", "calories")).toBe(250);
  });

  it("reads grams, including decimals and a decimal comma", () => {
    expect(parseNutrientFigure("12 g", "proteinG")).toBe(12);
    expect(parseNutrientFigure("0.3g", "fiberG")).toBe(0.3);
    expect(parseNutrientFigure("4,5 g", "fatG")).toBe(4.5);
    expect(parseNutrientFigure("12 grams", "carbsG")).toBe(12);
    expect(parseNutrientFigure("7", "saturatedFatG")).toBe(7);
    expect(parseNutrientFigure("500 mg", "proteinG")).toBe(0.5);
  });

  it("reads sodium in milligrams, converting grams", () => {
    expect(parseNutrientFigure("300 mg", "sodiumMg")).toBe(300);
    expect(parseNutrientFigure("1.2 g", "sodiumMg")).toBe(1200);
    expect(parseNutrientFigure("1,200mg", "sodiumMg")).toBe(1200);
    expect(parseNutrientFigure(450, "sodiumMg")).toBe(450);
  });

  it("rounds to one decimal place", () => {
    expect(parseNutrientFigure("12.345 g", "proteinG")).toBe(12.3);
    expect(parseNutrientFigure(270.6, "calories")).toBe(270.6);
  });

  it("rejects junk, negatives, ranges, percentages and absurd values", () => {
    for (const value of [
      "",
      "N/A",
      "about a cup",
      "-5 g",
      "10-12 g",
      "10 to 12 g",
      "<1 g",
      "12%",
      "12 oz",
      "1 2 g",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      null,
      undefined,
      {},
      [],
      true,
    ]) {
      expect(parseNutrientFigure(value, "proteinG"), String(value)).toBeUndefined();
    }
    expect(parseNutrientFigure("60000 kcal", "calories")).toBeUndefined();
    expect(parseNutrientFigure("900 g", "proteinG")).toBeUndefined();
    expect(parseNutrientFigure("80 g", "sodiumMg")).toBeUndefined();
    expect(parseNutrientFigure("12 g", "calories")).toBeUndefined();
  });

  it("accepts zero", () => {
    expect(parseNutrientFigure("0 g", "fiberG")).toBe(0);
  });
});

describe("nutritionFromFigures", () => {
  it("keeps usable figures with their source and drops the rest", () => {
    expect(
      nutritionFromFigures({ calories: "270 kcal", proteinG: 12, fatG: "lots", sodiumMg: -3 }, "page"),
    ).toEqual({ calories: 270, proteinG: 12, source: "page" });
  });

  it("returns nothing when no figure is usable", () => {
    expect(nutritionFromFigures({ calories: "n/a" }, "page")).toBeUndefined();
    expect(nutritionFromFigures({}, "manual")).toBeUndefined();
    expect(nutritionFromFigures(undefined, "page")).toBeUndefined();
  });
});

describe("sanitizeNutritionFigures", () => {
  it("returns only valid numeric figures, or nothing", () => {
    expect(sanitizeNutritionFigures({ calories: 400, proteinG: null, carbsG: -1, fiberG: 3 })).toEqual({ calories: 400, fiberG: 3 });
    expect(sanitizeNutritionFigures({ calories: null })).toBeUndefined();
    expect(sanitizeNutritionFigures(null)).toBeUndefined();
  });
});

describe("nutritionFromSchemaOrg", () => {
  it("reads a NutritionInformation node", () => {
    expect(
      nutritionFromSchemaOrg({
        "@type": "NutritionInformation",
        servingSize: "1 bowl",
        calories: "270 calories",
        proteinContent: "12 g",
        carbohydrateContent: "30 g",
        fatContent: "9 g",
        fiberContent: "0.3g",
        saturatedFatContent: "2 g",
        sodiumContent: "1.2 g",
        sugarContent: "4 g",
      }),
    ).toEqual({
      calories: 270,
      proteinG: 12,
      carbsG: 30,
      fatG: 9,
      fiberG: 0.3,
      saturatedFatG: 2,
      sodiumMg: 1200,
    });
  });

  it("takes the first node of an array and ignores anything unusable", () => {
    expect(nutritionFromSchemaOrg([{ calories: "100" }])).toEqual({ calories: 100 });
    expect(nutritionFromSchemaOrg({ calories: "unknown" })).toBeUndefined();
    expect(nutritionFromSchemaOrg("270 calories")).toBeUndefined();
    expect(nutritionFromSchemaOrg(null)).toBeUndefined();
  });
});

describe("readRecipeNutrition", () => {
  it("prefers the numeric field", () => {
    expect(
      readRecipeNutrition({
        nutritionPerServing: { calories: 500, source: "manual" },
        nutrition: { calories: "410 kcal" },
      }),
    ).toEqual({ calories: 500, source: "manual" });
  });

  it("falls back to the legacy strings, parsed and marked as from the page", () => {
    expect(
      readRecipeNutrition({
        nutrition: {
          servingSize: "1 bowl",
          calories: "410 kcal",
          protein: "14 g",
          carbohydrates: "48 g",
          fat: "19 g",
          fiber: "11 g",
          sugar: "6 g",
          sodium: "0.5 g",
        },
      }),
    ).toEqual({
      calories: 410,
      proteinG: 14,
      carbsG: 48,
      fatG: 19,
      fiberG: 11,
      sodiumMg: 500,
      source: "page",
    });
  });

  it("returns nothing when there is no usable figure", () => {
    expect(readRecipeNutrition({})).toBeUndefined();
    expect(readRecipeNutrition({ nutrition: { servingSize: "1 bowl", calories: "?" } })).toBeUndefined();
    expect(readRecipeNutrition({ nutritionPerServing: { source: "page" } })).toBeUndefined();
  });

  it("drops stored figures that are out of range", () => {
    expect(readRecipeNutrition({ nutritionPerServing: { calories: -4, proteinG: 10, source: "estimate" } })).toEqual({
      proteinG: 10,
      source: "estimate",
    });
  });
});

describe("hasNutritionFigures", () => {
  it("is true only when at least one figure is set", () => {
    expect(hasNutritionFigures({ source: "page" })).toBe(false);
    expect(hasNutritionFigures({ fiberG: 0, source: "page" })).toBe(true);
  });
});
