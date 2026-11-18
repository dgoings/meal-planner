import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  cleanName,
  isRecipeLink,
  mealKey,
  nameFromRecipeLink,
  parseSlotText,
  type Meal,
  type SlotType,
} from "./lib/plannerRules";
import {
  addDays,
  isDateKey,
  leftoverChoices,
  slotOrder,
  type SlotLike,
  type SlotRef,
} from "./lib/plannerSlots";
import {
  importStatusValidator,
  leftoverFromValidator,
  mealValidator,
  slotRefValidator,
  slotTypeValidator,
  weekStartValidator,
} from "./lib/plannerValidators";
import { insertUserRecipe } from "./lib/userRecipes";
import { canAccessRecipe } from "./recipes";
import { queueRecipeSource, startRecipeIngestion, type StartIngestion } from "./recipeIngestion";

const MAX_PEOPLE = 12;

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}

/** Whether `userId` may read and change `planner`. One owner today; households later. */
export function canAccessPlanner(userId: Id<"users">, planner: Doc<"planners">) {
  return planner.ownerId === userId;
}

export async function requirePlanner(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">) {
  const userId = await requireUser(ctx);
  const planner = await ctx.db.get(plannerId);
  if (planner === null || !canAccessPlanner(userId, planner)) {
    throw new Error("Planner was not found");
  }
  return { userId, planner };
}

/** People cooked for: rounded and clamped to 1–12; anything else becomes 1 (§2.7). */
export function normalizePeople(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PEOPLE, Math.max(1, Math.round(value)));
}

export const mine = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ plannerId: v.id("planners"), weekStart: weekStartValidator, people: v.number() }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const planner = await ctx.db
      .query("planners")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (planner === null) return null;
    return { plannerId: planner._id, weekStart: planner.weekStart, people: planner.people };
  },
});

export const ensure = mutation({
  args: {},
  returns: v.id("planners"),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("planners")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (existing !== null) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("planners", {
      ownerId: userId,
      weekStart: 1,
      people: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePreferences = mutation({
  args: {
    plannerId: v.id("planners"),
    weekStart: v.optional(weekStartValidator),
    people: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { plannerId, weekStart, people }) => {
    await requirePlanner(ctx, plannerId);
    const patch: Partial<Doc<"planners">> = { updatedAt: Date.now() };
    if (weekStart !== undefined) patch.weekStart = weekStart;
    if (people !== undefined) patch.people = normalizePeople(people);
    await ctx.db.patch(plannerId, patch);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Slots

const RECIPE_SCAN_LIMIT = 500;

type SlotValue =
  | { type: "cook"; recipeId?: Id<"recipes">; importId?: Id<"recipeImports">; importName?: string }
  | { type: "out"; mealId?: Id<"plannerMeals"> }
  | { type: "left"; from: SlotRef | "other"; mealId?: Id<"plannerMeals"> }
  | { type: "skip" };

function assertDate(date: string) {
  if (!isDateKey(date)) throw new Error("Invalid date");
}

async function slotRow(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  return await ctx.db
    .query("planSlots")
    .withIndex("by_planner_and_date", (q) =>
      q.eq("plannerId", plannerId).eq("date", ref.date).eq("meal", ref.meal),
    )
    .unique();
}

/**
 * For a Cook slot holding a pasted link: the import, and the recipe it
 * produced once the person who pasted it has saved it to their book.
 */
async function importedRecipe(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">) {
  if (row.type !== "cook" || row.recipeId !== undefined || row.importId === undefined) return null;
  const recipeImport = await ctx.db.get(row.importId);
  if (recipeImport === null) return null;
  const recipeId = recipeImport.recipeId;
  const saved =
    recipeId === undefined
      ? null
      : await ctx.db
          .query("savedRecipes")
          .withIndex("by_user_and_recipe", (q) => q.eq("userId", row.updatedBy).eq("recipeId", recipeId))
          .unique();
  return { recipeImport, recipeId: saved === null ? undefined : recipeId };
}

/**
 * A Cook slot's recipe. `usable` is false when the recipe was removed or its
 * owner can no longer open it; the slot then behaves as unlinked: no name, so
 * it is no leftovers source and retyping the title links a recipe again.
 */
async function cookRecipe(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">) {
  const imported = await importedRecipe(ctx, row);
  const recipeId = row.type === "cook" ? (row.recipeId ?? imported?.recipeId) : undefined;
  const recipe = recipeId === undefined ? null : await ctx.db.get(recipeId);
  const usable =
    recipe !== null && recipe.deletedAt === undefined && (await canAccessRecipe(ctx, row.updatedBy, recipe));
  return { imported, recipeId, recipe, usable };
}

/** The name a slot shows: its usable recipe's title or its planner meal's name. */
async function slotName(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">) {
  if (row.type === "cook") {
    const { recipeId, recipe, usable } = await cookRecipe(ctx, row);
    if (usable && recipe !== null) return cleanName(recipe.title);
    return recipeId === undefined ? (row.importName ?? "") : "";
  }
  if (row.type === "out" || row.type === "left") {
    const meal = row.mealId === undefined ? null : await ctx.db.get(row.mealId);
    return meal?.name ?? "";
  }
  return "";
}

export async function toSlotLike(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">): Promise<SlotLike> {
  return {
    date: row.date,
    meal: row.meal,
    type: row.type,
    name: await slotName(ctx, row),
    ...(row.type === "left" ? { from: row.from } : {}),
  };
}

/** Rows from `from` to `to` inclusive, as the slot rules see them. */
export async function loadSlots(
  ctx: QueryCtx | MutationCtx,
  plannerId: Id<"planners">,
  from: string,
  to: string,
) {
  const rows = await ctx.db
    .query("planSlots")
    .withIndex("by_planner_and_date", (q) =>
      q.eq("plannerId", plannerId).gte("date", from).lte("date", to),
    )
    .take(2 * 31);
  // The index orders "dinner" before "lunch"; callers want slot order.
  rows.sort((first, second) => slotOrder(first).localeCompare(slotOrder(second)));
  return await Promise.all(rows.map(async (row) => ({ row, slot: await toSlotLike(ctx, row) })));
}

async function writeSlot(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  ref: SlotRef,
  value: SlotValue | null,
) {
  const existing = await slotRow(ctx, plannerId, ref);
  if (value === null) {
    if (existing !== null) await ctx.db.delete(existing._id);
    return;
  }
  const document = { plannerId, date: ref.date, meal: ref.meal, updatedBy: userId, updatedAt: Date.now(), ...value };
  if (existing === null) await ctx.db.insert("planSlots", document);
  else await ctx.db.replace(existing._id, document);
}

/**
 * The user's newest saved recipe whose title has the same meal key as
 * `name`, or a new bare recipe in their book.
 */
async function resolveRecipe(ctx: MutationCtx, userId: Id<"users">, name: string) {
  const key = mealKey(name);
  const saved = await ctx.db
    .query("savedRecipes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(RECIPE_SCAN_LIMIT);
  for (const item of saved) {
    const recipe = await ctx.db.get(item.recipeId);
    if (recipe !== null && recipe.deletedAt === undefined && mealKey(recipe.title) === key) {
      return { recipeId: recipe._id, name: cleanName(recipe.title) };
    }
  }
  const recipeId = await insertUserRecipe(ctx, userId, { title: name, ingredients: [], instructions: [] });
  return { recipeId, name };
}

/** The planner's eat-out or leftovers meal with the same key, or a new one. */
async function resolvePlannerMeal(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  name: string,
) {
  const key = mealKey(name);
  const existing = await ctx.db
    .query("plannerMeals")
    .withIndex("by_planner_and_key", (q) => q.eq("plannerId", plannerId).eq("key", key))
    .first();
  if (existing !== null) return { mealId: existing._id, name: existing.name };
  const now = Date.now();
  const mealId = await ctx.db.insert("plannerMeals", {
    plannerId,
    name,
    key,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  return { mealId, name };
}

/** The newest leftover choice for `ref`, or "other" (§2.3). */
async function defaultLeftoverSource(ctx: MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  const slots = (await loadSlots(ctx, plannerId, addDays(ref.date, -6), ref.date)).map(({ slot }) => slot);
  return leftoverChoices(slots, ref)[0] ?? ("other" as const);
}

/** Writes a slot of `type` named `name` (ignored for Leftovers and Skip). */
async function planSlot(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  ref: SlotRef,
  type: SlotType,
  name: string,
): Promise<{ type: SlotType; name: string }> {
  if (type === "skip") {
    await writeSlot(ctx, plannerId, userId, ref, { type: "skip" });
    return { type, name: "" };
  }
  if (type === "left") {
    const from = await defaultLeftoverSource(ctx, plannerId, ref);
    await writeSlot(ctx, plannerId, userId, ref, { type: "left", from });
    return { type, name: "" };
  }
  if (type === "cook") {
    if (!name) {
      await writeSlot(ctx, plannerId, userId, ref, { type: "cook" });
      return { type, name: "" };
    }
    const recipe = await resolveRecipe(ctx, userId, name);
    await writeSlot(ctx, plannerId, userId, ref, { type: "cook", recipeId: recipe.recipeId });
    return { type, name: recipe.name };
  }
  if (!name) {
    await writeSlot(ctx, plannerId, userId, ref, { type: "out" });
    return { type, name: "" };
  }
  const meal = await resolvePlannerMeal(ctx, plannerId, userId, name);
  await writeSlot(ctx, plannerId, userId, ref, { type: "out", mealId: meal.mealId });
  return { type, name: meal.name };
}

const slotArgs = { plannerId: v.id("planners"), date: v.string(), meal: mealValidator };

/**
 * A type button: the selected type clears the slot, another replaces it (§2.3).
 * `text` is the main input's unsaved draft when the button was pressed straight
 * after typing; it becomes the name in this one change, so typing "Chipotle"
 * then pressing Eat out never makes a "Chipotle" recipe first.
 */
export const setType = mutation({
  args: { ...slotArgs, type: slotTypeValidator, text: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { plannerId, date, meal, type, text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    if (text !== undefined && isRecipeLink(text)) throw new Error("Paste recipe links with importLink");
    const ref = { date, meal };
    const row = await slotRow(ctx, plannerId, ref);
    if (row?.type === type) {
      await writeSlot(ctx, plannerId, userId, ref, null);
      return null;
    }
    const named = row === null || row.type === "cook" || row.type === "out";
    // A slot's own name carries: Cook's, Eat out's, and other leftovers'
    // (a leftovers source's name belongs to that earlier meal).
    const ownName = row !== null && (named || (row.type === "left" && row.from === "other"));
    const carried =
      text !== undefined && named ? cleanName(text)
      : ownName ? await slotName(ctx, row)
      : "";
    await planSlot(ctx, plannerId, userId, ref, type, carried);
    return null;
  },
});

/** Typed text committed into a slot's main input (§2.3 rules 2–6). */
export const commitText = mutation({
  args: { ...slotArgs, text: v.string() },
  returns: v.object({ type: v.union(slotTypeValidator, v.null()), name: v.string() }),
  handler: async (ctx, { plannerId, date, meal, text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    if (isRecipeLink(text)) throw new Error("Paste recipe links with importLink");
    const ref: SlotRef = { date, meal: meal as Meal };
    const row = await slotRow(ctx, plannerId, ref);
    if (row !== null && (row.type === "left" || row.type === "skip")) {
      throw new Error("This slot has no text");
    }
    const currentName = row === null ? "" : await slotName(ctx, row);
    if (row !== null && currentName === cleanName(text)) return { type: row.type, name: currentName };
    const intent = parseSlotText(text, row?.type ?? null);
    if (intent.kind !== "set") return { type: row?.type ?? null, name: currentName };
    return await planSlot(ctx, plannerId, userId, ref, intent.type, intent.name);
  },
});

async function requireLeftoverSlot(ctx: MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  const row = await slotRow(ctx, plannerId, ref);
  if (row === null || row.type !== "left") throw new Error("Slot is not leftovers");
  return row;
}

/** The Leftovers select: an earlier meal, or "other" (§2.3). */
export const setLeftoverOf = mutation({
  args: { ...slotArgs, from: leftoverFromValidator },
  returns: v.null(),
  handler: async (ctx, { plannerId, date, meal, from }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    const ref: SlotRef = { date, meal };
    const row = await requireLeftoverSlot(ctx, plannerId, ref);
    if (from === "other") {
      // An other-leftovers name survives only if the slot was already other.
      const mealId = row.from === "other" ? row.mealId : undefined;
      await writeSlot(ctx, plannerId, userId, ref, { type: "left", from: "other", ...(mealId ? { mealId } : {}) });
      return null;
    }
    const slots = (await loadSlots(ctx, plannerId, addDays(date, -6), date)).map(({ slot }) => slot);
    const offered = leftoverChoices(slots, ref).some(
      (choice) => choice.date === from.date && choice.meal === from.meal,
    );
    if (!offered) throw new Error("That meal can’t be used as leftovers here");
    await writeSlot(ctx, plannerId, userId, ref, { type: "left", from });
    return null;
  },
});

/** Text typed into the other-leftovers input (§2.3 commitOther). */
export const commitOther = mutation({
  args: { ...slotArgs, text: v.string() },
  returns: v.object({ name: v.string() }),
  handler: async (ctx, { plannerId, date, meal, text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    const ref: SlotRef = { date, meal };
    const row = await requireLeftoverSlot(ctx, plannerId, ref);
    const name = cleanName(text);
    const currentName = await slotName(ctx, row);
    if (row.from === "other" && currentName === name) return { name };
    if (!name) {
      await writeSlot(ctx, plannerId, userId, ref, { type: "left", from: "other" });
      return { name: "" };
    }
    const plannerMeal = await resolvePlannerMeal(ctx, plannerId, userId, name);
    await writeSlot(ctx, plannerId, userId, ref, { type: "left", from: "other", mealId: plannerMeal.mealId });
    return { name: plannerMeal.name };
  },
});

// ---------------------------------------------------------------------------
// Reading a week

const INGREDIENT_COUNT_LIMIT = 200;
const SUGGESTION_LIMIT = 500;

export const slotViewValidator = v.object({
  date: v.string(),
  meal: mealValidator,
  type: slotTypeValidator,
  name: v.string(),
  recipe: v.optional(
    v.object({ recipeId: v.id("recipes"), title: v.string(), ingredientCount: v.number(), available: v.boolean() }),
  ),
  from: v.optional(v.union(slotRefValidator, v.literal("other"))),
  import: v.optional(
    v.object({
      importId: v.id("recipeImports"),
      status: importStatusValidator,
      recipeId: v.optional(v.id("recipes")),
    }),
  ),
});

/**
 * The slots from six days before `start` to six days after it, so the
 * client can offer leftovers from the previous week.
 */
export const week = query({
  args: { plannerId: v.id("planners"), start: v.string() },
  returns: v.object({ slots: v.array(slotViewValidator) }),
  handler: async (ctx, { plannerId, start }) => {
    // Only the owner reads a planner, so recipe access is checked for the slot's writer (the owner).
    await requirePlanner(ctx, plannerId);
    assertDate(start);
    const loaded = await loadSlots(ctx, plannerId, addDays(start, -6), addDays(start, 6));
    const slots = await Promise.all(
      loaded.map(async ({ row, slot }) => {
        const view: typeof slotViewValidator.type = {
          date: slot.date,
          meal: slot.meal,
          type: slot.type,
          name: slot.name,
          ...(slot.from === undefined ? {} : { from: slot.from }),
        };
        const { imported, recipeId, recipe, usable } = await cookRecipe(ctx, row);
        if (imported !== null && imported.recipeId === undefined) {
          view.import = {
            importId: imported.recipeImport._id,
            status: imported.recipeImport.status,
            ...(imported.recipeImport.recipeId === undefined ? {} : { recipeId: imported.recipeImport.recipeId }),
          };
        }
        if (recipeId !== undefined) {
          const ingredients = usable
            ? await ctx.db
                .query("recipeIngredients")
                .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
                .take(INGREDIENT_COUNT_LIMIT)
            : [];
          const title = recipe === null ? "" : cleanName(recipe.title);
          view.recipe = { recipeId, title, ingredientCount: ingredients.length, available: usable };
        }
        return view;
      }),
    );
    return { slots };
  },
});

/** Autocomplete: saved recipe titles and the planner's meal names, once each. */
export const suggestions = query({
  args: { plannerId: v.id("planners") },
  returns: v.array(v.string()),
  handler: async (ctx, { plannerId }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    const names = new Map<string, string>();
    const saved = await ctx.db
      .query("savedRecipes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(SUGGESTION_LIMIT);
    for (const item of saved) {
      const recipe = await ctx.db.get(item.recipeId);
      if (recipe === null || recipe.deletedAt !== undefined) continue;
      const name = cleanName(recipe.title);
      if (!names.has(mealKey(name))) names.set(mealKey(name), name);
    }
    const meals = await ctx.db
      .query("plannerMeals")
      .withIndex("by_planner_and_key", (q) => q.eq("plannerId", plannerId))
      .take(SUGGESTION_LIMIT);
    for (const meal of meals) if (!names.has(meal.key)) names.set(meal.key, meal.name);
    return [...names.values()].sort((first, second) => first.localeCompare(second));
  },
});

// ---------------------------------------------------------------------------
// Pasting a recipe link

/**
 * Starts the app's existing import for `url` (preview, then an explicit
 * save) and makes the slot a Cook slot waiting for that recipe.
 */
export async function startSlotImport(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { plannerId: Id<"planners">; date: string; meal: Meal; url: string },
  startIngestion: StartIngestion = startRecipeIngestion,
): Promise<Id<"recipeImports">> {
  const planner = await ctx.db.get(args.plannerId);
  if (planner === null || !canAccessPlanner(userId, planner)) throw new Error("Planner was not found");
  assertDate(args.date);
  const url = args.url.trim();
  if (!isRecipeLink(url)) throw new Error("Not a recipe link");
  const { importId } = await queueRecipeSource(ctx, { userId, sourceUrl: url, sourceKind: "direct" }, startIngestion);
  await writeSlot(ctx, args.plannerId, userId, { date: args.date, meal: args.meal }, {
    type: "cook",
    importId,
    importName: nameFromRecipeLink(url),
  });
  return importId;
}

export const importLink = mutation({
  args: { ...slotArgs, url: v.string() },
  returns: v.id("recipeImports"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await startSlotImport(ctx, userId, args);
  },
});
