// Validators shared by the planner schema and functions.
import { v } from "convex/values";

export const mealValidator = v.union(v.literal("lunch"), v.literal("dinner"));
export const slotTypeValidator = v.union(
  v.literal("cook"),
  v.literal("left"),
  v.literal("out"),
  v.literal("skip"),
);
export const weekStartValidator = v.union(v.literal(0), v.literal(1), v.literal(6));
export const slotRefValidator = v.object({ date: v.string(), meal: mealValidator });
export const leftoverFromValidator = v.union(slotRefValidator, v.literal("other"));

const slotBase = {
  plannerId: v.id("planners"),
  date: v.string(),
  meal: mealValidator,
  updatedBy: v.id("users"),
  updatedAt: v.number(),
};

/** One planned slot. The type belongs to the slot, not to the meal it names. */
export const planSlotValidator = v.union(
  v.object({ ...slotBase, type: v.literal("cook"), recipeId: v.optional(v.id("recipes")) }),
  v.object({ ...slotBase, type: v.literal("out"), mealId: v.optional(v.id("plannerMeals")) }),
  v.object({
    ...slotBase,
    type: v.literal("left"),
    from: leftoverFromValidator,
    mealId: v.optional(v.id("plannerMeals")),
  }),
  v.object({ ...slotBase, type: v.literal("skip") }),
);
