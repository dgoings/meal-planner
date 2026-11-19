"use client";

import { useMutation, useQuery } from "convex/react";
import { ArchiveRestore } from "lucide-react";
import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { amountEdited } from "@/convex/lib/planGrocery";
import type { GroceryItem } from "@/lib/data/types";

export function SavedGroceryList({ listId }: { listId: string }) {
  const data = useQuery(api.groceryLists.get, {
    listId: listId as Id<"groceryLists">,
  });

  const updateList = useMutation(api.groceryLists.updateList);
  const [restoreState, setRestoreState] = useState<
    "idle" | "working" | "error"
  >("idle");
  const [savedVersion, setSavedVersion] = useState(0);
  const items: GroceryItem[] | undefined = useMemo(
    () =>
      data?.items.map((item) => ({
        id: item._id,
        name: item.name,
        quantity: item.quantityText ?? item.quantity?.toString() ?? "",
        unit: item.unit ?? "",
        category: item.category ?? "Other",
        source: data.itemSources?.find((source) => source.itemId === item._id)?.recipeTitles.join(", ") || undefined,
        planAmount:
          item.planKey !== undefined && amountEdited(item, item)
            ? [item.planQuantityText, item.planUnit].filter(Boolean).join(" ") || undefined
            : undefined,
        checked: item.isChecked,
      })),
    [data],
  );

  if (data === undefined) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading grocery list…</span>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (data === null || items === undefined) {
    return (
      <p className="rounded-xl border border-border bg-white p-6">
        This grocery list could not be found.
      </p>
    );
  }

  async function restore() {
    if (!data) return;
    setRestoreState("working");
    try {
      await updateList({ listId: data.list._id, status: "active" });
      setRestoreState("idle");
    } catch {
      setRestoreState("error");
    }
  }

  return (
    <>
      {data.list.status === "archived" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle p-4">
          <div className="text-sm">
            <p>
              <strong>This list is archived.</strong> Restore it to bring it
              back to your grocery lists.
            </p>
            {restoreState === "error" && (
              <p className="mt-1 font-bold text-red-700" role="alert">
                Couldn&apos;t restore this list. Try again.
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={restore}
            disabled={restoreState === "working"}
          >
            <ArchiveRestore size={17} />
            {restoreState === "working" ? "Restoring…" : "Restore list"}
          </Button>
        </div>
      )}
      {/* Remounting after a save replaces the local draft, including items that
           only had temporary client IDs, with the list as the server stored it. */}
      <GroceryListEditor
        key={savedVersion}
        initialSaveState={savedVersion > 0 ? "saved" : "idle"}
        onSaved={() => setSavedVersion((version) => version + 1)}
        initialItems={items}
        initialName={data.list.name}
        listId={data.list._id}
        needsInitialSave={data.list.needsInitialSave === true}
        sourceLabel={data.list.plannerId === undefined ? "From" : "For"}
      />
    </>
  );
}
