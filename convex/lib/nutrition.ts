import { v, type Infer } from "convex/values";

/**
 * Per-serving nutrition for a recipe. This module owns the stored shape, the
 * parsing of text figures ("270 calories", "1.2 g" sodium) into numbers, and
 * reading a recipe's nutrition: every reader goes through
 * `readRecipeNutrition`, which also understands the legacy string field.
 */

/** Display order: calories and protein first. */
export const NUTRIENT_KEYS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "saturatedFatG",
  "sodiumMg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const NUTRIENTS: Record<NutrientKey, { label: string; unit: "kcal" | "g" | "mg"; max: number }> = {
  calories: { label: "Calories", unit: "kcal", max: 5_000 },
  proteinG: { label: "Protein", unit: "g", max: 500 },
  carbsG: { label: "Carbs", unit: "g", max: 1_000 },
  fatG: { label: "Fat", unit: "g", max: 500 },
  fiberG: { label: "Fiber", unit: "g", max: 200 },
  saturatedFatG: { label: "Saturated fat", unit: "g", max: 300 },
  sodiumMg: { label: "Sodium", unit: "mg", max: 20_000 },
};

export const nutritionSourceValidator = v.union(
  v.literal("page"),
  v.literal("manual"),
  v.literal("estimate"),
);

const figureFields = {
  calories: v.optional(v.number()),
  proteinG: v.optional(v.number()),
  carbsG: v.optional(v.number()),
  fatG: v.optional(v.number()),
  fiberG: v.optional(v.number()),
  saturatedFatG: v.optional(v.number()),
  sodiumMg: v.optional(v.number()),
};

/** Figures without a source, as an extraction carries them. */
export const nutritionFiguresValidator = v.object(figureFields);

/** The stored `recipes.nutritionPerServing` field. */
export const nutritionPerServingValidator = v.object({
  ...figureFields,
  source: nutritionSourceValidator,
});

/**
 * The legacy `recipes.nutrition` field: free-text figures that only seed data
 * ever wrote. Kept so existing rows still validate; read it only through
 * `readRecipeNutrition`.
 */
export const legacyNutritionValidator = v.object({
  servingSize: v.optional(v.string()),
  calories: v.optional(v.string()),
  protein: v.optional(v.string()),
  carbohydrates: v.optional(v.string()),
  fat: v.optional(v.string()),
  fiber: v.optional(v.string()),
  sugar: v.optional(v.string()),
  sodium: v.optional(v.string()),
});

export type NutritionSource = Infer<typeof nutritionSourceValidator>;
export type NutritionFigures = Infer<typeof nutritionFiguresValidator>;
export type NutritionPerServing = Infer<typeof nutritionPerServingValidator>;
export type LegacyNutrition = Infer<typeof legacyNutritionValidator>;

type Unit = "kcal" | "kj" | "g" | "mg" | "other";

function unitOf(word: string | undefined): Unit | undefined {
  if (word === undefined) return undefined;
  if (/^(?:k?cals?|kcals?|calories|calorie)$/.test(word)) return "kcal";
  if (word === "kj") return "kj";
  if (/^(?:g|gr|grams?)$/.test(word)) return "g";
  if (/^(?:mg|milligrams?)$/.test(word)) return "mg";
  return "other";
}

/** Range-checks one figure, rounding to one decimal place. */
export function validNutrient(value: unknown, key: NutrientKey): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > NUTRIENTS[key].max) return undefined;
  return Math.round(value * 10) / 10;
}

function convert(amount: number, unit: Unit | undefined, key: NutrientKey) {
  if (unit === undefined) return amount;
  const expected = NUTRIENTS[key].unit;
  if (unit === expected) return amount;
  if (expected === "kcal" && unit === "kj") return amount / 4.184;
  if (expected === "g" && unit === "mg") return amount / 1_000;
  if (expected === "mg" && unit === "g") return amount * 1_000;
  return undefined;
}

/**
 * Parses one figure, such as "270 calories", "0.3g" or "1.2 g" of sodium, into
 * the unit `key` is stored in. Returns undefined for anything that is not one
 * plain non-negative amount in a matching unit, or that is out of range.
 */
export function parseNutrientFigure(value: unknown, key: NutrientKey): number | undefined {
  if (typeof value === "number") return validNutrient(value, key);
  if (typeof value !== "string") return undefined;
  const text = value
    .toLowerCase()
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
    .replace(/(\d),(\d)/g, "$1.$2");
  if (/[<>≤≥%]|-\s*\d|\d\s*[-–—]|\bto\s+\d/.test(text)) return undefined;
  if ((text.match(/\d+(?:\.\d+)?/g) ?? []).length !== 1) return undefined;
  const match = text.match(/(\d+(?:\.\d+)?)\s*([a-zµμ]+)?/);
  if (match === null) return undefined;
  const amount = convert(Number(match[1]), unitOf(match[2]), key);
  return amount === undefined ? undefined : validNutrient(amount, key);
}

/** Keeps only the usable figures; undefined when none is. */
function collect(read: (key: NutrientKey) => number | undefined): NutritionFigures | undefined {
  const figures: NutritionFigures = {};
  for (const key of NUTRIENT_KEYS) {
    const value = read(key);
    if (value !== undefined) figures[key] = value;
  }
  return Object.keys(figures).length > 0 ? figures : undefined;
}

/** Parses loose figures (numbers or text) into stored nutrition with `source`. */
export function nutritionFromFigures(
  figures: Partial<Record<NutrientKey, unknown>> | null | undefined,
  source: NutritionSource,
): NutritionPerServing | undefined {
  if (figures === null || figures === undefined) return undefined;
  const parsed = collect((key) => parseNutrientFigure(figures[key], key));
  return parsed === undefined ? undefined : { ...parsed, source };
}

/** Range-checks numeric figures (for example a model's output); undefined when none is usable. */
export function sanitizeNutritionFigures(
  figures: Partial<Record<NutrientKey, number | null | undefined>> | null | undefined,
): NutritionFigures | undefined {
  if (figures === null || figures === undefined) return undefined;
  return collect((key) => validNutrient(figures[key], key));
}

const SCHEMA_ORG_PROPERTIES: Record<NutrientKey, string> = {
  calories: "calories",
  proteinG: "proteinContent",
  carbsG: "carbohydrateContent",
  fatG: "fatContent",
  fiberG: "fiberContent",
  saturatedFatG: "saturatedFatContent",
  sodiumMg: "sodiumContent",
};

/** Reads a schema.org NutritionInformation node (or the first of an array). */
export function nutritionFromSchemaOrg(value: unknown): NutritionFigures | undefined {
  const node = Array.isArray(value) ? value[0] : value;
  if (typeof node !== "object" || node === null) return undefined;
  const record = node as Record<string, unknown>;
  return collect((key) => parseNutrientFigure(record[SCHEMA_ORG_PROPERTIES[key]], key));
}

const LEGACY_FIELDS: Partial<Record<NutrientKey, keyof LegacyNutrition>> = {
  calories: "calories",
  proteinG: "protein",
  carbsG: "carbohydrates",
  fatG: "fat",
  fiberG: "fiber",
  sodiumMg: "sodium",
};

/**
 * A recipe's per-serving nutrition: the numeric field when it has figures,
 * otherwise the legacy strings parsed with source "page"; undefined when no
 * figure is usable.
 */
export function readRecipeNutrition(recipe: {
  nutritionPerServing?: NutritionPerServing;
  nutrition?: LegacyNutrition;
}): NutritionPerServing | undefined {
  if (recipe.nutritionPerServing !== undefined) {
    const stored = recipe.nutritionPerServing;
    const figures = collect((key) => validNutrient(stored[key], key));
    if (figures !== undefined) return { ...figures, source: stored.source };
  }
  const legacy = recipe.nutrition;
  if (legacy === undefined) return undefined;
  const figures = collect((key) => {
    const field = LEGACY_FIELDS[key];
    return field === undefined ? undefined : parseNutrientFigure(legacy[field], key);
  });
  return figures === undefined ? undefined : { ...figures, source: "page" };
}

export function hasNutritionFigures(nutrition: NutritionFigures & { source?: NutritionSource }) {
  return NUTRIENT_KEYS.some((key) => nutrition[key] !== undefined);
}
