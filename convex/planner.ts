import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { weekStartValidator } from "./lib/plannerValidators";

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
