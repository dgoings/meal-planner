"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { GroceryListCard } from "@/components/grocery/grocery-list-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

const newListHref = "/app/grocery-lists/new";

export default function GroceryListsPage() {
  const lists = useQuery(api.groceryLists.listMine);
  const [showArchived, setShowArchived] = useState(false);
  const currentLists = lists?.filter((list) => list.status !== "archived");
  const archivedLists = lists?.filter((list) => list.status === "archived") ?? [];

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Plan and shop"
        title="Grocery lists"
        description="Keep recipe ingredients and one-off items together, with quantities you can change."
        actions={
          <Button asChild>
            <Link href={newListHref}>
              <Plus size={17} />
              New list
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {currentLists === undefined ? (
          <div role="status" aria-live="polite"><span className="sr-only">Loading grocery lists…</span><Skeleton className="h-56" /></div>
        ) : (
          currentLists.map((list) => <GroceryListCard key={list._id} list={list} />)
        )}
        <Link
          className="h-full min-w-0"
          href={newListHref}
        >
          <Card className="recipe-card h-64 border-dashed">
            <CardContent className="grid h-full place-items-center text-center">
              <div>
                <Plus className="mx-auto text-muted-foreground" />
                <p className="mt-3 font-extrabold">Start another list</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  For a party, a trip, or next week.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
      {archivedLists.length > 0 && (
        <section className="mt-10" aria-labelledby="archived-lists-heading">
          <h2 id="archived-lists-heading">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-extrabold uppercase tracking-[.08em] text-muted-foreground hover:bg-surface-subtle"
              aria-expanded={showArchived}
              aria-controls="archived-lists"
              onClick={() => setShowArchived((open) => !open)}
            >
              <ChevronDown
                size={17}
                className={showArchived ? "" : "-rotate-90"}
                aria-hidden
              />
              Archived lists ({archivedLists.length})
            </button>
          </h2>
          {showArchived && (
            <div id="archived-lists" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archivedLists.map((list) => (
                <GroceryListCard key={list._id} list={list} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
