import { weekSummary } from "@/convex/lib/plannerSlots";
import { SLOT_TYPES, type SlotView } from "./types";

/** "{n} of 14 planned" and a count per type for the shown week (§2.3). */
export function WeekStrip({ slots, start }: { slots: SlotView[]; start: string }) {
  const summary = weekSummary(slots, start);
  return (
    <ul className="planner-strip" aria-label="Week summary">
      <li className="badge planner-strip-total">{summary.planned} of 14 planned</li>
      {SLOT_TYPES.map(({ type, label }) => (
        <li className="badge" key={type}>
          <span className={`planner-dot planner-dot-${type}`} aria-hidden="true" />
          {label} {summary[type]}
        </li>
      ))}
    </ul>
  );
}
