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

// Checked in order, so specific phrases ("peanut butter", "chicken broth",
// "garlic powder") claim an ingredient before a broader word in a later aisle.
const INGREDIENT_KEYWORDS: Array<[GroceryCategory, RegExp]> = [
  ["Frozen", /\bfrozen\b/],
  ["Produce", /\b(green beans|snap peas|bell peppers?|jalape(n|ñ)os?|chil(e|i) peppers?|lemon juice|lime juice|lemon zest|lime zest)\b/],
  ["Spices & Seasonings", /\b(salt|black pepper|white pepper|peppercorns?|cumin|paprika|cinnamon|nutmeg|chili powder|garlic powder|onion powder|cayenne|turmeric|coriander|cardamom|allspice|curry powder|red pepper flakes|bay lea(f|ves)|oregano|seasoning|ground (cloves|ginger|mustard)|dried (thyme|basil|rosemary|parsley|dill|sage|marjoram|tarragon))\b/],
  ["Pantry", /\b(broth|stock|bouillon|flour|sugar|rice|pasta|spaghetti|penne|macaroni|noodles|oats|oil|vinegar|sauce|ketchup|mustard|mayonnaise|honey|syrup|baking soda|baking powder|yeast|cornstarch|vanilla|cocoa|chocolate|beans|lentils|chickpeas|canned|paste|breadcrumbs|panko|nuts|almonds|walnuts|pecans|cashews|peanuts|peanut butter|raisins|quinoa|couscous|coconut milk|evaporated milk|condensed milk|cream of tartar|molasses)\b/],
  ["Dairy & Eggs", /\b(milk|butter|buttermilk|cream|cheese|cheddar|parmesan|mozzarella|ricotta|feta|yogurt|eggs?|egg whites?|egg yolks?|half-and-half)\b/],
  ["Meat & Seafood", /\b(chicken|beef|pork|bacon|sausages?|ham|turkey|lamb|steaks?|shrimp|prawns|salmon|tuna|cod|tilapia|fish|prosciutto|pancetta|chorizo|anchov(y|ies)|scallops|crab|lobster|mussels|clams)\b/],
  ["Bakery", /\b(bread|baguette|buns?|rolls|tortillas?|pita|croissants?|brioche)\b/],
  ["Beverages", /\b(wine|beer|vodka|rum|whiskey|bourbon|tequila|brandy|juice|coffee|espresso|tea|club soda|sparkling water)\b/],
  ["Produce", /\b(onions?|garlic|shallots?|tomato(es)?|potato(es)?|carrots?|celery|lettuce|spinach|kale|arugula|cabbage|broccoli|cauliflower|zucchini|squash|cucumbers?|mushrooms?|peppers?|lemons?|limes?|oranges?|apples?|bananas?|berries|strawberries|blueberries|raspberries|avocados?|ginger|cilantro|parsley|basil|mint|thyme|rosemary|dill|chives|scallions?|leeks?|corn|peas|asparagus|eggplants?|herbs)\b/],
];

export function groceryCategoryForIngredient(
  name: string | null | undefined,
): GroceryCategory | undefined {
  const label = name?.trim().toLowerCase();
  if (!label) return undefined;
  return INGREDIENT_KEYWORDS.find(([, pattern]) => pattern.test(label))?.[0];
}

export function groceryCategoryOrder(category: string) {
  const index = (GROCERY_CATEGORIES as readonly string[]).indexOf(category);
  if (category === "Other") return GROCERY_CATEGORIES.length + 1;
  return index === -1 ? GROCERY_CATEGORIES.length : index;
}
