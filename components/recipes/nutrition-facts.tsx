import { Badge } from "@/components/ui/badge";
import { NUTRIENT_KEYS, NUTRIENTS, type NutritionPerServing } from "@/convex/lib/nutrition";

export function formatNutrient(value: number, unit: "kcal" | "g" | "mg") {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: unit === "g" ? 1 : 0 }).format(value);
}

/** The heading and figures of a recipe's per-serving nutrition, with no actions. */
export function NutritionFacts({
  nutrition,
  headingId,
  action,
}: {
  nutrition: NutritionPerServing;
  headingId: string;
  action?: React.ReactNode;
}) {
  const figures = NUTRIENT_KEYS.flatMap((key) => {
    const value = nutrition[key];
    return value === undefined ? [] : [{ key, value, ...NUTRIENTS[key] }];
  });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={headingId} className="section-heading">Nutrition per serving</h2>
          {nutrition.source === "estimate" && <Badge>Estimated</Badge>}
        </div>
        {action}
      </div>
      <dl className="nutrition-facts mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {figures.map(({ key, value, label, unit }) => (
          <div key={key} className="rounded-lg bg-surface-subtle px-3 py-2">
            <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-extrabold">
              {formatNutrient(value, unit)}
              <span className="ml-1 text-sm font-semibold text-muted-foreground">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
