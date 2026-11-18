import { describe, expect, it } from "vitest";
import {
  groceryCategory,
  groceryCategoryForIngredient,
  groceryCategoryOrder,
} from "./groceryCategory";

describe("grocery categories", () => {
  it("maps exact and free-form labels to a store section", () => {
    expect(groceryCategory("produce")).toBe("Produce");
    expect(groceryCategory("Fresh vegetables")).toBe("Produce");
    expect(groceryCategory("Dried herbs & spices")).toBe("Spices & Seasonings");
    expect(groceryCategory("poultry")).toBe("Meat & Seafood");
    expect(groceryCategory("Canned goods")).toBe("Pantry");
    expect(groceryCategory("mystery")).toBeUndefined();
    expect(groceryCategory("  ")).toBeUndefined();
    expect(groceryCategory(null)).toBeUndefined();
  });

  it("guesses an ingredient's aisle, letting specific phrases win", () => {
    expect(groceryCategoryForIngredient("yellow onion")).toBe("Produce");
    expect(groceryCategoryForIngredient("green beans")).toBe("Produce");
    expect(groceryCategoryForIngredient("lemon juice")).toBe("Produce");
    expect(groceryCategoryForIngredient("garlic powder")).toBe("Spices & Seasonings");
    expect(groceryCategoryForIngredient("kosher salt")).toBe("Spices & Seasonings");
    expect(groceryCategoryForIngredient("chicken broth")).toBe("Pantry");
    expect(groceryCategoryForIngredient("peanut butter")).toBe("Pantry");
    expect(groceryCategoryForIngredient("coconut milk")).toBe("Pantry");
    expect(groceryCategoryForIngredient("unsalted butter")).toBe("Dairy & Eggs");
    expect(groceryCategoryForIngredient("large eggs")).toBe("Dairy & Eggs");
    expect(groceryCategoryForIngredient("boneless chicken thighs")).toBe("Meat & Seafood");
    expect(groceryCategoryForIngredient("ground beef")).toBe("Meat & Seafood");
    expect(groceryCategoryForIngredient("frozen peas")).toBe("Frozen");
    expect(groceryCategoryForIngredient("dry white wine")).toBe("Beverages");
    expect(groceryCategoryForIngredient("cornstarch")).toBe("Pantry");
    expect(groceryCategoryForIngredient("za'atar")).toBeUndefined();
    expect(groceryCategoryForIngredient(null)).toBeUndefined();
  });

  it("orders known sections first, unknown ones next, and Other last", () => {
    const sorted = ["Other", "Household", "Pantry", "Produce"].sort(
      (first, second) => groceryCategoryOrder(first) - groceryCategoryOrder(second),
    );
    expect(sorted).toEqual(["Produce", "Pantry", "Household", "Other"]);
  });
});
