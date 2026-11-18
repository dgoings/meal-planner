"use client";

import { useMutation } from "convex/react";
import { Pencil, Save } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  NUTRIENT_KEYS,
  NUTRIENTS,
  type NutrientKey,
  type NutritionFigures,
  type NutritionPerServing,
} from "@/convex/lib/nutrition";
import { NutritionFacts } from "./nutrition-facts";

type Drafts = Record<NutrientKey, string>;

function draftsFrom(nutrition: NutritionPerServing | undefined): Drafts {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, nutrition?.[key] === undefined ? "" : String(nutrition[key])]),
  ) as Drafts;
}

/** Blank clears a figure; anything else must be a number in range. */
function figuresFrom(drafts: Drafts): { figures: NutritionFigures } | { invalid: NutrientKey } {
  const figures: NutritionFigures = {};
  for (const key of NUTRIENT_KEYS) {
    const text = drafts[key].trim().replace(",", ".");
    if (!text) continue;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > NUTRIENTS[key].max) return { invalid: key };
    figures[key] = value;
  }
  return { figures };
}

function NutritionEditor({
  recipeId,
  nutrition,
  headingId,
  onClose,
  onMessage,
}: {
  recipeId: Id<"recipes">;
  nutrition: NutritionPerServing | undefined;
  headingId: string;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  const setNutrition = useMutation(api.recipeCards.setNutrition);
  const fieldId = useId();
  const [drafts, setDrafts] = useState(() => draftsFrom(nutrition));
  const [invalid, setInvalid] = useState<NutrientKey | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = figuresFrom(drafts);
    if ("invalid" in parsed) {
      const { label, max } = NUTRIENTS[parsed.invalid];
      setInvalid(parsed.invalid);
      setError(`${label} must be a number from 0 to ${max.toLocaleString("en-US")}, or left blank.`);
      document.getElementById(`${fieldId}-${parsed.invalid}`)?.focus();
      return;
    }
    setInvalid(null);
    setError("");
    setIsSaving(true);
    try {
      await setNutrition({ recipeId, figures: parsed.figures });
      onMessage(Object.keys(parsed.figures).length > 0 ? "Nutrition saved." : "Nutrition removed.");
      onClose();
    } catch {
      setError("We couldn’t save the nutrition.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} aria-labelledby={headingId} noValidate>
      <h2 id={headingId} className="section-heading">Nutrition per serving</h2>
      <p className="section-copy">All optional. Leave a figure blank to clear it.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NUTRIENT_KEYS.map((key) => (
          <label key={key} className="grid gap-2 text-sm font-bold" htmlFor={`${fieldId}-${key}`}>
            {NUTRIENTS[key].label} ({NUTRIENTS[key].unit})
            <Input
              id={`${fieldId}-${key}`}
              inputMode="decimal"
              autoComplete="off"
              autoFocus={key === NUTRIENT_KEYS[0]}
              maxLength={12}
              value={drafts[key]}
              aria-invalid={invalid === key || undefined}
              aria-describedby={invalid === key ? `${fieldId}-error` : undefined}
              onChange={(event) => setDrafts({ ...drafts, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      {error && <p id={`${fieldId}-error`} className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" disabled={isSaving}><Save size={16} />{isSaving ? "Saving…" : "Save nutrition"}</Button>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

/**
 * A recipe's per-serving nutrition. Without figures it renders nothing unless
 * the owner is editing; the "Add nutrition" action lives with the recipe's
 * other actions.
 */
export function RecipeNutrition({
  recipeId,
  nutrition,
  canEdit,
  editing,
  onEditingChange,
  onMessage,
}: {
  recipeId: Id<"recipes">;
  nutrition: NutritionPerServing | undefined;
  canEdit: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onMessage: (message: string) => void;
}) {
  const headingId = useId();
  if (canEdit && editing) {
    return (
      <Card>
        <CardContent>
          <NutritionEditor
            recipeId={recipeId}
            nutrition={nutrition}
            headingId={headingId}
            onClose={() => onEditingChange(false)}
            onMessage={onMessage}
          />
        </CardContent>
      </Card>
    );
  }
  if (nutrition === undefined) return null;
  return (
    <Card>
      <CardContent>
        <section aria-labelledby={headingId}>
          <NutritionFacts
            nutrition={nutrition}
            headingId={headingId}
            action={canEdit ? <Button variant="ghost" size="sm" onClick={() => onEditingChange(true)}><Pencil size={16} />Edit nutrition</Button> : undefined}
          />
        </section>
      </CardContent>
    </Card>
  );
}
