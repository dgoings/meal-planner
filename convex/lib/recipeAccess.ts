import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function canAccessRecipe(
  ctx: QueryCtx,
  userId: Id<"users">,
  recipe: Doc<"recipes">,
) {
  if (recipe.isPublic === true) return true;

  const saved = await ctx.db
    .query("savedRecipes")
    .withIndex("by_user_and_recipe", (q) =>
      q.eq("userId", userId).eq("recipeId", recipe._id),
    )
    .first();
  if (saved !== null) return true;

  if (recipe.importId === undefined) return false;
  const recipeImport = await ctx.db.get(recipe.importId);
  return recipeImport?.requestedBy === userId;
}
