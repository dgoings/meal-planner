"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, BookCheck, BookPlus, Check, Clock3, ExternalLink, Pencil, Save, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { AddRecipeToListButton } from "@/components/grocery/add-recipe-to-list-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { recipeArt, recipeTotalMinutes } from "@/lib/data/recipe-view";
import { FoodArt } from "./food-art";
import { RecipeEditor } from "./recipe-editor";
import { RecipeIngredients } from "./recipe-ingredients";
import { CurrentRecipeButton } from "./current-recipe-button";

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const data = useQuery(api.recipes.get, { recipeId });
  const setNotes = useMutation(api.recipeCards.setNotes);
  const acknowledgeReview = useMutation(api.recipeCards.acknowledgeReview);
  const removeCard = useMutation(api.recipeCards.removeCard);
  const addToBook = useMutation(api.recipeCards.addToBook);
  const [editing, setEditing] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (data === undefined) return <div className="page-container" role="status" aria-live="polite"><span className="sr-only">Loading recipe…</span><Skeleton className="h-10 w-48" /><Skeleton className="mt-6 h-96" /></div>;
  if (data === null) return <div className="page-container"><EmptyState icon={Pencil} title="Recipe not found" description="It may have been removed or belong to another account." action={<Button asChild><Link href="/app/recipe-book">Back to Recipe Book</Link></Button>} /></div>;

  const { recipe, ingredients, importReview } = data;
  const recipeDocId = recipe._id as Id<"recipes">;
  const totalMinutes = recipeTotalMinutes(recipe);
  const tags = recipe.categories.length > 0 ? recipe.categories : recipe.cuisines;

  async function saveNotes() {
    const notes = notesRef.current?.value.trim() ?? "";
    setError("");
    try {
      await setNotes({ recipeId: recipeDocId, notes: notes || null });
      setMessage("Notes saved.");
    } catch {
      setError("We couldn’t save your notes.");
    }
  }

  async function finishReview() {
    setError("");
    try {
      await acknowledgeReview({ recipeId: recipeDocId });
      setMessage("Review completed. Add the recipe to your book when you’re ready.");
    } catch {
      setError("We couldn’t complete the review.");
    }
  }

  async function saveToBook() {
    setError("");
    try {
      await addToBook({ recipeId: recipeDocId });
      setMessage("Recipe added to your Recipe Book.");
    } catch {
      setError("We couldn’t add this recipe to your book.");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${recipe.title} from your Recipe Book? Its grocery list will remain.`)) return;
    setError("");
    try {
      await removeCard({ recipeId: recipeDocId });
      router.replace("/app/recipe-book");
    } catch {
      setError("We couldn’t remove this recipe.");
    }
  }

  return (
    <div className="page-container">
      <Button asChild variant="ghost" className="mb-5"><Link href="/app/recipe-book"><ArrowLeft size={17} />Back to Recipe Book</Link></Button>
      {importReview?.status === "needs_review" && (
        <Card className="mb-6 border-amber-300 bg-amber-50"><CardContent><p className="font-extrabold text-amber-950">This generated recipe card needs your review</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{importReview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><Button className="mt-4" size="sm" onClick={() => void finishReview()}><Check size={16} />Mark review complete</Button></CardContent></Card>
      )}
      {(error || message) && <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-primary-soft text-primary"}`} role={error ? "alert" : "status"}>{error || message}</p>}

      {editing ? (
        <RecipeEditor
          recipe={recipe}
          ingredients={ingredients}
          onClose={() => setEditing(false)}
          onError={(text) => { setError(text); if (text) setMessage(""); }}
          onMessage={(text) => { setError(""); setMessage(text); }}
        />
      ) : (
        <>
          <div className="recipe-detail-hero">
            <FoodArt variant={recipeArt(recipe.title)} label={tags[0] ?? "Recipe"} imageUrl={recipe.imageUrl} />
            <div className="p-6 sm:p-8">
              <div className="cluster">{tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{recipe.title}</h1>
              {recipe.description && <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{recipe.description}</p>}
              <div className="mt-6 cluster text-sm font-bold text-muted-foreground">
                {totalMinutes !== undefined && <span><Clock3 className="inline" size={17} /> {totalMinutes} min</span>}
                {recipe.servings !== undefined && <span><Users className="inline" size={17} /> {recipe.servings} servings</span>}
                {data.saved !== null && <Badge className="bg-primary-soft text-primary"><BookCheck size={14} />In Recipe Book</Badge>}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {data.saved === null && <Button onClick={() => void saveToBook()}><BookPlus size={17} />Add to Recipe Book</Button>}
                <CurrentRecipeButton recipeId={recipe._id} size="default" variant={data.saved === null ? "secondary" : "default"} />
                <AddRecipeToListButton recipeId={recipe._id} variant="secondary" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={() => { setMessage(""); setEditing(true); }}><Pencil size={16} />Edit recipe</Button>
                {recipe.sourceUrl && <Button asChild variant="ghost" size="sm"><a href={recipe.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />View original</a></Button>}
                <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => void remove()}><Trash2 size={16} />Remove recipe</Button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
            <RecipeIngredients ingredients={ingredients} initialServings={recipe.servings} />
            <section><h2 className="section-heading">Instructions</h2><p className="section-copy mb-4">A clean, distraction-free cooking view.</p><ol className="stack">{recipe.instructions.map((instruction) => <li className="flex gap-4 rounded-xl border border-border bg-white p-5" key={instruction.position}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-white">{instruction.position}</span><p className="pt-1 text-sm leading-6">{instruction.text}</p></li>)}</ol></section>
          </div>
        </>
      )}

      <Card className="mt-8"><CardContent><h2 className="section-heading">Personal notes</h2><p className="section-copy">Only you can see these notes.</p><textarea ref={notesRef} className="input mt-4 min-h-32 w-full resize-y" maxLength={10000} defaultValue={data.saved?.notes ?? ""} placeholder="What would you change next time?" /><Button className="mt-3" variant="secondary" onClick={() => void saveNotes()}><Save size={16} />Save notes</Button></CardContent></Card>
    </div>
  );
}
