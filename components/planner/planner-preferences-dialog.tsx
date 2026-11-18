"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { WeekStart } from "@/convex/lib/plannerSlots";

const WEEK_STARTS: { value: WeekStart; label: string }[] = [
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
];

/** People cooked for: rounded and clamped to 1–12; blank or invalid becomes 1 (§2.7). */
function normalizePeople(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

type PreferencesProps = {
  plannerId: Id<"planners">;
  weekStart: WeekStart;
  people: number;
  onWeekStartChange: (weekStart: WeekStart) => void;
};

export function PlannerPreferencesDialog({
  open,
  onOpenChange,
  ...props
}: PreferencesProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Planner settings</DialogTitle>
        <DialogDescription>Choose the day your week starts and how many people you cook for.</DialogDescription>
        {/* Mounted only while open, so each opening starts from the saved values. */}
        <PreferencesFields {...props} />
      </DialogContent>
    </Dialog>
  );
}

function PreferencesFields({ plannerId, weekStart, people, onWeekStartChange }: PreferencesProps) {
  const updatePreferences = useMutation(api.planner.updatePreferences);
  const [peopleDraft, setPeopleDraft] = useState(String(people));
  const [error, setError] = useState(false);

  async function save(patch: { weekStart?: WeekStart; people?: number }) {
    setError(false);
    try {
      await updatePreferences({ plannerId, ...patch });
    } catch {
      setError(true);
    }
  }

  function commitPeople() {
    const next = normalizePeople(peopleDraft);
    setPeopleDraft(String(next));
    if (next !== people) void save({ people: next });
  }

  return (
    <div className="mt-5 grid gap-4">
      <label className="grid gap-1.5 text-sm font-bold">
        Week starts on
        <select
          className="input"
          value={weekStart}
          onChange={(event) => {
            const next = Number(event.target.value) as WeekStart;
            void save({ weekStart: next });
            onWeekStartChange(next);
          }}
        >
          {WEEK_STARTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-bold">
        People you cook for, yourself included
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          step={1}
          value={peopleDraft}
          onChange={(event) => setPeopleDraft(event.target.value)}
          onBlur={commitPeople}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitPeople();
            }
          }}
        />
      </label>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Couldn’t save that setting. Try again.</p>}
    </div>
  );
}
