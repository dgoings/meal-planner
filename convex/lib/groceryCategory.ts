export const GROCERY_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Spices & Seasonings",
  "Frozen",
  "Beverages",
  "Other",
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

// Older catalog entries hold whatever free-form label the extraction agent
// chose at the time, so they are matched by keyword rather than exact name.
const CATEGORY_KEYWORDS: Array<[GroceryCategory, RegExp]> = [
  ["Spices & Seasonings", /spice|season|dried herb/],
  ["Frozen", /frozen|freezer/],
  ["Beverages", /beverage|drink|juice|wine|beer|spirit|liquor/],
  ["Bakery", /baker|bread/],
  ["Meat & Seafood", /meat|poultry|seafood|fish|butcher|deli/],
  ["Dairy & Eggs", /dairy|egg|cheese|milk|refrigerated/],
  ["Produce", /produce|vegetable|fruit|herb/],
  ["Pantry", /pantry|grain|pasta|rice|canned|oil|condiment|baking|sauce|nut|legume|bean|dry goods|sweetener/],
];

export function groceryCategory(
  value: string | null | undefined,
): GroceryCategory | undefined {
  const label = value?.trim().toLowerCase();
  if (!label) return undefined;
  const exact = GROCERY_CATEGORIES.find(
    (category) => category.toLowerCase() === label,
  );
  if (exact !== undefined) return exact;
  return CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(label))?.[0];
}

export function groceryCategoryOrder(category: string) {
  const index = (GROCERY_CATEGORIES as readonly string[]).indexOf(category);
  if (category === "Other") return GROCERY_CATEGORIES.length + 1;
  return index === -1 ? GROCERY_CATEGORIES.length : index;
}
