"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ImportResultDialog } from "@/components/discovery/import-result-dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isRecipeLink, type Meal, type SlotType } from "@/convex/lib/plannerRules";
import {
  formatDay,
  leftoverChoices,
  leftoverLabel,
  nextSlot,
  resolveLeftover,
  type SlotRef,
} from "@/convex/lib/plannerSlots";
import { announceRecipeImport } from "@/lib/recipe-import-events";
import { cn } from "@/lib/utils";
import { SLOT_TYPES, type SlotView } from "./types";

/** The id of a slot's main control: its input, its leftovers select or its Skip button. */
export const slotControlId = (date: string, meal: Meal) => `planner-slot-${date}-${meal}`;
/** The id of a slot's other-leftovers input. */
export const otherInputId = (date: string, meal: Meal) => `planner-other-${date}-${meal}`;

const sourceKey = (ref: SlotRef) => `${ref.date}|${ref.meal}`;

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

export function SlotCell({ plannerId, date, meal, weekStart, slots, requestFocus }: SlotCellProps) {
  const setType = useMutation(api.planner.setType);
  const commitText = useMutation(api.planner.commitText);
  const commitOther = useMutation(api.planner.commitOther);
  const setLeftoverOf = useMutation(api.planner.setLeftoverOf);
  const importLink = useMutation(api.planner.importLink);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultImportId, setResultImportId] = useState<Id<"recipeImports"> | null>(null);

  const slot = slots.find((candidate) => candidate.date === date && candidate.meal === meal);
  const type = slot?.type ?? null;
  const ref = { date, meal };
  const label = `${formatDay(date).long} ${meal}`;
  const controlId = slotControlId(date, meal);

  /** Runs one change, tracking Saving… and the failure alert. Resolves to whether it saved. */
  async function run(change: () => Promise<unknown>) {
    setFailed(false);
    setPending((count) => count + 1);
    try {
      await change();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending((count) => count - 1);
    }
  }

  /** Enter: lunch, same day's dinner, next day's lunch; stays put on the last dinner (§2.3). */
  function focusNext() {
    const next = nextSlot(ref, weekStart);
    if (next) requestFocus(slotControlId(next.date, next.meal));
  }

  // After a type change, focus moves to the slot's main control (§2.3). That
  // control often exists only once the change lands, so wait until the slot
  // shows the expected state, then focus whatever control it now has.
  const section = useRef<HTMLElement>(null);
  const focusWhen = useRef<((current: SlotView | undefined) => boolean) | null>(null);
  useEffect(() => {
    const landed = focusWhen.current;
    if (landed === null || !landed(slot)) return;
    focusWhen.current = null;
    const active = document.activeElement;
    // Leave focus alone if the user has moved on to another part of the page.
    if (active !== null && active !== document.body && !section.current?.contains(active)) return;
    const showsOther = slot?.type === "left" && resolveLeftover(slots, slot)?.kind !== "source";
    document.getElementById(showsOther ? otherInputId(date, meal) : controlId)?.focus();
  });

  function pressType(pressed: SlotType) {
    // Ignored rather than disabled while saving, so focus can still land on the buttons.
    if (pending > 0) return;
    const clearing = type === pressed;
    focusWhen.current = (current) => (clearing ? current === undefined : current?.type === pressed);
    void run(() => setType({ plannerId, date, meal, type: pressed })).then((saved) => {
      if (!saved) focusWhen.current = null;
    });
  }

  function showImport(importId: Id<"recipeImports">) {
    setResultImportId(importId);
    setResultOpen(true);
  }

  function commitMain(text: string) {
    if (isRecipeLink(text)) {
      // The app's import flow: a preview the user reviews and saves (owner decision 15).
      return run(async () => {
        const importId = await importLink({ plannerId, date, meal, url: text.trim() });
        announceRecipeImport(importId);
        showImport(importId);
      });
    }
    return run(() => commitText({ plannerId, date, meal, text }));
  }

  return (
    <section ref={section} className={cn("planner-slot", type && `planner-slot-${type}`)} aria-label={label} aria-busy={pending > 0}>
      <p className="planner-slot-label" aria-hidden="true">{meal === "lunch" ? "Lunch" : "Dinner"}</p>
      <div className="planner-types" role="group" aria-label={`${label} type`}>
        {SLOT_TYPES.map((option) => (
          <button
            key={option.type}
            type="button"
            id={option.type === "skip" && type === "skip" ? controlId : undefined}
            className={`planner-type planner-type-${option.type}`}
            aria-pressed={type === option.type}
            aria-disabled={pending > 0 || undefined}
            onClick={() => pressType(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {type === "skip" ? (
        <p className="planner-skip-text">Skipping {meal}</p>
      ) : type === "left" && slot ? (
        <LeftoversBody
          slot={slot}
          slots={slots}
          label={label}
          controlId={controlId}
          onChoose={(from) => {
            if (from === "other") focusWhen.current = (current) => current?.type === "left" && current.from === "other";
            void run(() => setLeftoverOf({ plannerId, date, meal, from })).then((saved) => {
              if (!saved) focusWhen.current = null;
            });
          }}
          onCommitOther={(text) => run(() => commitOther({ plannerId, date, meal, text }))}
          onEnter={focusNext}
        />
      ) : (
        <SlotInput
          id={controlId}
          label={label}
          initial={slot?.name ?? ""}
          placeholder={type === "cook" || type === "out" ? PLACEHOLDERS[type] : `Plan ${meal}`}
          onCommit={commitMain}
          onEnter={focusNext}
        />
      )}

      <SlotMeta slot={slot} pending={pending > 0} onShowImport={showImport} />
      {failed && <p className="planner-meta planner-error" role="alert">Couldn’t save this meal. Try again.</p>}
      {resultImportId !== null && (
        <ImportResultDialog importId={resultImportId} open={resultOpen} onOpenChange={setResultOpen} />
      )}
    </section>
  );
}

/**
 * A slot's text input. It keeps its own draft and commits on Enter, change
 * and blur; the last committed text guards against Enter followed by blur
 * committing twice.
 */
function SlotInput({
  id,
  label,
  initial,
  placeholder,
  onCommit,
  onEnter,
}: {
  id: string;
  label: string;
  initial: string;
  placeholder: string;
  onCommit: (text: string) => Promise<boolean>;
  onEnter: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const committed = useRef(initial);
  // When the saved name changes (a commit landed, or the slot was cleared),
  // show it. The input stays mounted so it keeps focus.
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    setDraft(initial);
  }
  useEffect(() => {
    committed.current = initial;
  }, [initial]);

  function commit() {
    if (draft === committed.current) return;
    const previous = committed.current;
    committed.current = draft;
    void onCommit(draft).then((saved) => {
      if (!saved) committed.current = previous;
    });
  }

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
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commit();
        onEnter();
      }}
    />
  );
}

function LeftoversBody({
  slot,
  slots,
  label,
  controlId,
  onChoose,
  onCommitOther,
  onEnter,
}: {
  slot: SlotView;
  slots: SlotView[];
  label: string;
  controlId: string;
  onChoose: (from: SlotRef | "other") => void;
  onCommitOther: (text: string) => Promise<boolean>;
  onEnter: () => void;
}) {
  const choices = leftoverChoices(slots, slot);
  const resolved = resolveLeftover(slots, slot);
  const selected = resolved?.kind === "source" ? sourceKey(resolved.source) : "other";
  return (
    <>
      <select
        id={controlId}
        className="input"
        aria-label={`${label} is leftovers of`}
        value={selected}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "other") return onChoose("other");
          const choice = choices.find((candidate) => sourceKey(candidate) === value);
          if (choice) onChoose(choice);
        }}
      >
        {choices.map((choice) => {
          const source = slots.find((candidate) => candidate.date === choice.date && candidate.meal === choice.meal)!;
          return <option key={sourceKey(choice)} value={sourceKey(choice)}>{leftoverLabel(source)}</option>;
        })}
        <option value="other">Other leftovers</option>
      </select>
      {selected === "other" && (
        <SlotInput
          id={otherInputId(slot.date, slot.meal)}
          label={`${label} leftovers`}
          initial={slot.name}
          placeholder="What are the leftovers?"
          onCommit={onCommitOther}
          onEnter={onEnter}
        />
      )}
    </>
  );
}

function SlotMeta({
  slot,
  pending,
  onShowImport,
}: {
  slot: SlotView | undefined;
  pending: boolean;
  onShowImport: (importId: Id<"recipeImports">) => void;
}) {
  const recipe = slot?.type === "cook" ? slot.recipe : undefined;
  if (pending) return <p className="planner-meta">Saving…</p>;
  if (slot?.import) {
    const pendingImport = slot.import;
    if (pendingImport.status === "failed") {
      return (
        <p className="planner-meta">
          <span className="planner-warn">The recipe couldn’t be imported.</span>
          <button type="button" className="planner-link-button" onClick={() => onShowImport(pendingImport.importId)}>See why</button>
        </p>
      );
    }
    if (pendingImport.recipeId) {
      return <p className="planner-meta"><Link href={`/app/recipes/${pendingImport.recipeId}`}>Review and save the recipe</Link></p>;
    }
    return <p className="planner-meta">Reading the recipe…</p>;
  }
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
