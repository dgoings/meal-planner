import { groceryCategoryForIngredient } from "./groceryCategory";
import { parseManualIngredient } from "./manualIngredient";
import { nutritionFromSchemaOrg } from "./nutrition";
import type { RecipeExtraction } from "./recipeAgentTypes";
import { findRecipeNode } from "./recipeScrape";

export const JSON_LD_RECIPE_MODEL = "schema.org-json-ld";

const MAX_INSTRUCTIONS = 100;
const MAX_INGREDIENTS = 200;
const MAX_MINUTES = 10_080;
const MAX_NESTING = 6;

type Instruction = RecipeExtraction["instructions"][number];
type Ingredient = RecipeExtraction["ingredients"][number];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  frac12: "½", frac14: "¼", frac34: "¾", deg: "°", ndash: "–", mdash: "—",
  hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é",
};

function decodeEntity(entity: string, body: string) {
  if (body.startsWith("#")) {
    const code = body[1]?.toLowerCase() === "x"
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : entity;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, decodeEntity)
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasType(record: Record<string, unknown>, type: string) {
  const declared = record["@type"];
  return declared === type || (Array.isArray(declared) && declared.includes(type));
}

function names(value: unknown): string | null {
  const parts = asArray(value)
    .map((item) =>
      typeof item === "object" && item !== null
        ? cleanText((item as Record<string, unknown>).name, 300)
        : cleanText(item, 300),
    )
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? [...new Set(parts)].join(", ").slice(0, 300) : null;
}

function labels(value: unknown, maxItems: number): string[] {
  const parts = asArray(value)
    .flatMap((item) => (typeof item === "string" ? item.split(",") : [item]))
    .map((item) => cleanText(item, 100))
    .filter((item): item is string => item !== null);
  return [...new Set(parts)].slice(0, maxItems);
}

function minutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return null;
  const [, days = "0", hours = "0", mins = "0", seconds = "0"] = match;
  const total = Math.round(
    Number(days) * 1_440 + Number(hours) * 60 + Number(mins) + Number(seconds) / 60,
  );
  // Sites commonly publish PT0M for "not specified", so zero is treated as unknown.
  return total > 0 && total <= MAX_MINUTES ? total : null;
}

function recipeYield(value: unknown) {
  const yields = asArray(value)
    .map((item) => cleanText(item, 200))
    .filter((item): item is string => item !== null);
  const servings = yields
    .map((item) => Number(item.match(/^\d+(?:\.\d+)?/)?.[0]))
    .find((number) => Number.isFinite(number) && number > 0 && number <= 1_000);
  return {
    yieldText: yields.find((item) => /\D/.test(item)) ?? yields[0] ?? null,
    servings: servings ?? null,
  };
}

function collectInstructions(
  value: unknown,
  section: string | null,
  steps: Instruction[],
  depth = 0,
) {
  if (depth > MAX_NESTING || steps.length >= MAX_INSTRUCTIONS) return;
  if (typeof value === "string") {
    for (const line of value.split(/\n+/)) {
      if (steps.length >= MAX_INSTRUCTIONS) return;
      const text = cleanText(line.replace(/^\s*(?:step\s*)?\d+[.):]\s+/i, ""), 5_000);
      if (text) steps.push({ position: steps.length + 1, text, section });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectInstructions(item, section, steps, depth + 1);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (hasType(record, "HowToSection")) {
    collectInstructions(
      record.itemListElement,
      cleanText(record.name, 200) ?? section,
      steps,
      depth + 1,
    );
    return;
  }
  if (record.text === undefined && record.itemListElement !== undefined) {
    collectInstructions(record.itemListElement, section, steps, depth + 1);
    return;
  }
  collectInstructions(record.text ?? record.name, section, steps, depth + 1);
}

function ingredient(line: string, position: number): Ingredient {
  const parsed = parseManualIngredient(line);
  const isOptional = /\boptional\b/i.test(line);
  const name =
    (isOptional
      ? parsed.name.replace(/\s*\(optional\)|,?\s*optional$/i, "").trim()
      : parsed.name
    ).slice(0, 300) || line.toLowerCase().slice(0, 300);
  const preparation = parsed.preparation?.replace(/^optional$/i, "").trim();
  return {
    position,
    section: null,
    originalText: line,
    name,
    normalizedName: name,
    quantity:
      parsed.quantity !== undefined && parsed.quantity <= 1_000_000
        ? parsed.quantity
        : null,
    quantityText: parsed.quantityText?.slice(0, 100) ?? null,
    unit: parsed.unit ?? null,
    preparation: preparation ? preparation.slice(0, 300) : null,
    notes: null,
    category: groceryCategoryForIngredient(name) ?? null,
    isOptional,
  };
}

// Returns null whenever the page's structured data is not a complete recipe,
// so the caller can fall back to the language model.
export function extractionFromJsonLd(recipeJsonLd: string): RecipeExtraction | null {
  let recipe: Record<string, unknown> | undefined;
  try {
    recipe = findRecipeNode(JSON.parse(recipeJsonLd));
  } catch {
    return null;
  }
  if (recipe === undefined) return null;

  const title = cleanText(recipe.name ?? recipe.headline, 300);
  if (title === null) return null;

  const ingredients = asArray(recipe.recipeIngredient ?? recipe.ingredients)
    .map((line) => cleanText(line, 1_000))
    .filter((line): line is string => line !== null)
    .slice(0, MAX_INGREDIENTS)
    .map((line, index) => ingredient(line, index + 1));

  const instructions: Instruction[] = [];
  collectInstructions(recipe.recipeInstructions, null, instructions);

  if (ingredients.length === 0 || instructions.length === 0) return null;

  // Unusable figures are dropped; nutrition never makes an extraction fail.
  const nutrition = nutritionFromSchemaOrg(recipe.nutrition);

  return {
    title,
    description: cleanText(recipe.description, 2_000),
    sourceSite: names(recipe.publisher),
    sourceAuthor: names(recipe.author),
    ...recipeYield(recipe.recipeYield),
    prepTimeMinutes: minutes(recipe.prepTime),
    cookTimeMinutes: minutes(recipe.cookTime),
    totalTimeMinutes: minutes(recipe.totalTime),
    cuisines: labels(recipe.recipeCuisine, 20),
    categories: labels(recipe.recipeCategory, 20),
    keywords: labels(recipe.keywords, 30),
    instructions,
    ingredients,
    ...(nutrition === undefined ? {} : { nutrition }),
    warnings: [],
  };
}
