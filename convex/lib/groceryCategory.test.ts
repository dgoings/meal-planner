import { describe, expect, it } from "vitest";
import { groceryCategory, groceryCategoryOrder } from "./groceryCategory";

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

  it("orders known sections first, unknown ones next, and Other last", () => {
    const sorted = ["Other", "Household", "Pantry", "Produce"].sort(
      (first, second) => groceryCategoryOrder(first) - groceryCategoryOrder(second),
    );
    expect(sorted).toEqual(["Produce", "Pantry", "Household", "Other"]);
  });
});
