"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Ingredient = {
  _id: string;
  originalText: string;
  name: string;
  quantity?: number;
  unit?: string;
  preparation?: string;
  notes?: string;
  isOptional: boolean;
};

const KITCHEN_FRACTIONS: Array<[number, string]> = [
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [1 / 2, "1/2"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [7 / 8, "7/8"],
];

export function formatQuantity(value: number) {
  const whole = Math.floor(value);
  const remainder = value - whole;
  if (remainder < 0.02) return String(whole);
  if (remainder > 0.98) return String(whole + 1);
  const fraction = KITCHEN_FRACTIONS.find(
    ([amount]) => Math.abs(amount - remainder) < 0.02,
  );
  if (fraction !== undefined && whole < 100) {
    return whole === 0 ? fraction[1] : `${whole} ${fraction[1]}`;
  }
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(rounded);
}

export function scaledIngredientText(
  ingredient: Ingredient,
  multiplier: number,
) {
  if (ingredient.quantity === undefined || multiplier === 1) {
    return ingredient.originalText;
  }
  const details = [ingredient.unit, ingredient.name, ingredient.preparation]
    .filter(Boolean)
    .join(" ");
  const suffix = [ingredient.notes, ingredient.isOptional ? "optional" : undefined]
    .filter(Boolean)
    .join(", ");
  return `${formatQuantity(ingredient.quantity * multiplier)} ${details}${suffix ? `, ${suffix}` : ""}`;
}

export function RecipeIngredients({
  ingredients,
  initialServings,
  servings: controlledServings,
  onServingsChange,
}: {
  ingredients: Ingredient[];
  initialServings?: number;
  servings?: number;
  onServingsChange?: (servings: number) => void;
}) {
  const baseServings = Math.max(1, initialServings ?? 1);
  const [localServings, setLocalServings] = useState(baseServings);
  const servings = controlledServings ?? localServings;
  function setServings(next: number) {
    setLocalServings(next);
    onServingsChange?.(next);
  }
  const multiplier = servings / baseServings;
  const canScale = initialServings !== undefined;

  return (
    <section>
      <div className="section-row">
        <div>
          <h2 className="section-heading">Ingredients</h2>
          <p className="section-copy" aria-live="polite">
            {canScale ? `For ${servings} servings` : "Original recipe amounts"}
          </p>
        </div>
        {canScale && <div className="cluster">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Decrease servings"
            disabled={servings <= 1}
            onClick={() => setServings(Math.max(1, servings - 1))}
          >
            <Minus size={16} />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Increase servings"
            onClick={() => setServings(servings + 1)}
          >
            <Plus size={16} />
          </Button>
        </div>}
      </div>
      <Card>
        <CardContent>
          <ul className="divide-y divide-border">
            {ingredients.map((ingredient) => (
              <li className="py-3 text-sm" key={ingredient._id}>
                {scaledIngredientText(ingredient, multiplier)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
