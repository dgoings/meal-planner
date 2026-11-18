"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Id } from "@/convex/_generated/dataModel";
import type { Meal } from "@/convex/lib/plannerRules";
import { formatDay, leftoverChoices, leftoverLabel, resolveLeftover } from "@/convex/lib/plannerSlots";
import { cn } from "@/lib/utils";
import { SLOT_TYPES, type SlotView } from "./types";

/** The id of a slot's main control: its input, its leftovers select or its Skip button. */
export const slotControlId = (date: string, meal: Meal) => `planner-slot-${date}-${meal}`;
/** The id of a slot's other-leftovers input. */
export const otherInputId = (date: string, meal: Meal) => `planner-other-${date}-${meal}`;

const sourceKey = (ref: { date: string; meal: Meal }) => `${ref.date}|${ref.meal}`;

const PLACEHOLDERS = { cook: "What are you cooking?", out: "Where or what?" } as const;

export type SlotCellProps = {
  plannerId: Id<"planners">;
  date: string;
  meal: Meal;
  weekStart: string;
  /** Every slot the week query returned, which leftover choices need. */
  slots: SlotView[];
  requestFocus: (id: string) => void;
};

export function SlotCell({ date, meal, slots }: SlotCellProps) {
  const slot = slots.find((candidate) => candidate.date === date && candidate.meal === meal);
  const type = slot?.type ?? null;
  const day = formatDay(date);
  const label = `${day.long} ${meal}`;
  const controlId = slotControlId(date, meal);

  return (
    <section className={cn("planner-slot", type && `planner-slot-${type}`)} aria-label={label}>
      <p className="planner-slot-label" aria-hidden="true">{meal === "lunch" ? "Lunch" : "Dinner"}</p>
      <div className="planner-types" role="group" aria-label={`${label} type`}>
        {SLOT_TYPES.map((option) => (
          <button
            key={option.type}
            type="button"
            id={option.type === "skip" && type === "skip" ? controlId : undefined}
            className={`planner-type planner-type-${option.type}`}
            aria-pressed={type === option.type}
          >
            {option.label}
          </button>
        ))}
      </div>

      {type === "skip" ? (
        <p className="planner-skip-text">Skipping {meal}</p>
      ) : type === "left" && slot ? (
        <LeftoversBody slot={slot} slots={slots} label={label} controlId={controlId} />
      ) : (
        <SlotInput
          key={slot?.name ?? ""}
          id={controlId}
          label={label}
          initial={slot?.name ?? ""}
          placeholder={type === "cook" || type === "out" ? PLACEHOLDERS[type] : `Plan ${meal}`}
        />
      )}

      <SlotMeta slot={slot} />
    </section>
  );
}

function SlotInput({ id, label, initial, placeholder }: { id: string; label: string; initial: string; placeholder: string }) {
  const [draft, setDraft] = useState(initial);
  return (
    <Input
      id={id}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      autoComplete="off"
      enterKeyHint="next"
      list="planner-suggestions"
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}

function LeftoversBody({ slot, slots, label, controlId }: { slot: SlotView; slots: SlotView[]; label: string; controlId: string }) {
  const choices = leftoverChoices(slots, slot);
  const resolved = resolveLeftover(slots, slot);
  const selected = resolved?.kind === "source" ? sourceKey(resolved.source) : "other";
  return (
    <>
      <select id={controlId} className="input" aria-label={`${label} is leftovers of`} value={selected} onChange={() => undefined}>
        {choices.map((choice) => {
          const source = slots.find((candidate) => candidate.date === choice.date && candidate.meal === choice.meal)!;
          return <option key={sourceKey(choice)} value={sourceKey(choice)}>{leftoverLabel(source)}</option>;
        })}
        <option value="other">Other leftovers</option>
      </select>
      {selected === "other" && (
        <SlotInput
          key={slot.name}
          id={otherInputId(slot.date, slot.meal)}
          label={`${label} leftovers`}
          initial={slot.name}
          placeholder="What are the leftovers?"
        />
      )}
    </>
  );
}

function SlotMeta({ slot }: { slot: SlotView | undefined }) {
  const recipe = slot?.type === "cook" ? slot.recipe : undefined;
  if (!slot || !recipe) return null;
  if (!recipe.available) {
    return <p className="planner-meta"><span className="planner-warn">Removed from your Recipe Book</span></p>;
  }
  const count = recipe.ingredientCount;
  return (
    <p className="planner-meta">
      <Link href={`/app/recipe-book/${recipe.recipeId}`} aria-label={`Open the ${slot.name} recipe`}>Recipe</Link>
      {count === 0
        ? <span className="planner-warn">No ingredients yet</span>
        : <span>{count} {count === 1 ? "ingredient" : "ingredients"}</span>}
    </p>
  );
}
