"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { recipeArt } from "@/lib/data/recipe-view";
import { FoodArt } from "./food-art";

type RecipeData = NonNullable<FunctionReturnType<typeof api.recipes.get>>;

const IMAGE_TYPES = ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TAGS = 20;

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function IngredientEditor({ ingredient, onError }: { ingredient: Doc<"recipeIngredients">; onError: (message: string) => void }) {
  const updateIngredient = useMutation(api.recipeCards.updateIngredient);
  const removeIngredient = useMutation(api.recipeCards.removeIngredient);
  const [name, setName] = useState(ingredient.name);
  const [quantity, setQuantity] = useState(ingredient.quantityText ?? (ingredient.quantity === undefined ? "" : String(ingredient.quantity)));
  const [unit, setUnit] = useState(ingredient.unit ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!name.trim()) return onError("Ingredient names cannot be empty.");
    const parsedQuantity = optionalNumber(quantity);
    setIsSaving(true);
    onError("");
    try {
      await updateIngredient({
        recipeIngredientId: ingredient._id,
        name: name.trim(),
        originalText: [quantity.trim(), unit.trim(), name.trim()].filter(Boolean).join(" "),
        quantity: parsedQuantity,
        quantityText: parsedQuantity === null && quantity.trim() ? quantity.trim() : null,
        unit: unit.trim() || null,
      });
    } catch {
      onError(`We couldn’t save ${ingredient.name}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${ingredient.name} from this recipe?`)) return;
    onError("");
    try {
      await removeIngredient({ recipeIngredientId: ingredient._id });
    } catch {
      onError(`We couldn’t remove ${ingredient.name}.`);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_auto_auto]">
      <Input className="col-span-4 sm:col-span-1" value={name} maxLength={300} onChange={(event) => setName(event.target.value)} aria-label="Ingredient name" />
      <Input value={quantity} maxLength={100} onChange={(event) => setQuantity(event.target.value)} aria-label={`Quantity for ${ingredient.name}`} placeholder="qty" />
      <Input value={unit} maxLength={100} onChange={(event) => setUnit(event.target.value)} aria-label={`Unit for ${ingredient.name}`} placeholder="unit" />
      <Button size="icon" variant="secondary" disabled={isSaving} onClick={() => void save()} aria-label={`Save ${ingredient.name}`}><Save size={16} /></Button>
      <Button size="icon" variant="ghost" onClick={() => void remove()} aria-label={`Remove ${ingredient.name}`}><Trash2 size={16} /></Button>
    </div>
  );
}

export function RecipeEditor({
  recipe,
  ingredients,
  onClose,
  onError,
  onMessage,
}: {
  recipe: RecipeData["recipe"];
  ingredients: RecipeData["ingredients"];
  onClose: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const updateCard = useMutation(api.recipeCards.updateCard);
  const addIngredient = useMutation(api.recipeCards.addIngredient);
  const generateImageUploadUrl = useMutation(api.recipeCards.generateImageUploadUrl);
  const setImage = useMutation(api.recipeCards.setImage);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const servingsRef = useRef<HTMLInputElement>(null);
  const prepTimeRef = useRef<HTMLInputElement>(null);
  const cookTimeRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState(recipe.categories.length > 0 ? recipe.categories : recipe.cuisines);
  const [tagDraft, setTagDraft] = useState("");
  const [newIngredient, setNewIngredient] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  function withDraftTags(current: string[], draft: string) {
    const next = [...current];
    for (const piece of draft.split(",")) {
      const tag = piece.trim().replace(/\s+/g, " ");
      if (tag && !next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    return next;
  }

  function commitTagDraft() {
    const next = withDraftTags(tags, tagDraft);
    if (next.length > MAX_TAGS) return onError(`A recipe can have at most ${MAX_TAGS} tags.`);
    setTags(next);
    setTagDraft("");
  }

  async function saveRecipe() {
    const title = titleRef.current?.value.trim() ?? "";
    const description = descriptionRef.current?.value.trim() ?? "";
    const instructionRows = (instructionsRef.current?.value ?? "").split("\n").map((text) => text.trim()).filter(Boolean);
    const categories = withDraftTags(tags, tagDraft);
    if (!title || instructionRows.length === 0) return onError("A recipe needs a title and at least one instruction.");
    if (categories.length > MAX_TAGS) return onError(`A recipe can have at most ${MAX_TAGS} tags.`);
    setIsSaving(true);
    onError("");
    try {
      await updateCard({
        recipeId: recipe._id,
        title,
        description: description || null,
        servings: optionalNumber(servingsRef.current?.value ?? ""),
        prepTimeMinutes: optionalNumber(prepTimeRef.current?.value ?? ""),
        cookTimeMinutes: optionalNumber(cookTimeRef.current?.value ?? ""),
        totalTimeMinutes: null,
        instructions: instructionRows.map((text, index) => ({ position: index + 1, text })),
        categories,
      });
      onMessage("Recipe changes saved.");
      onClose();
    } catch {
      onError("We couldn’t save your recipe changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function addRecipeIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newIngredient.trim()) return;
    onError("");
    try {
      await addIngredient({ recipeId: recipe._id, name: newIngredient.trim() });
      setNewIngredient("");
      onMessage("Ingredient added to the recipe. Existing grocery lists were not changed.");
    } catch {
      onError("We couldn’t add that ingredient.");
    }
  }

  async function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return onError("Choose a JPG, PNG, WebP, GIF, or AVIF image.");
    if (file.size > MAX_IMAGE_BYTES) return onError("Photos must be 8 MB or smaller.");
    setIsUploading(true);
    onError("");
    try {
      const uploadUrl = await generateImageUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      if (!(await setImage({ recipeId: recipe._id, storageId }))) throw new Error("Image rejected");
      onMessage("Photo added.");
    } catch {
      onError("We couldn’t upload that photo.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Editing recipe</p>
          <h1 className="page-title">{recipe.title}</h1>
        </div>
        <div className="cluster">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={isSaving} onClick={() => void saveRecipe()}><Save size={17} />{isSaving ? "Saving…" : "Save recipe"}</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <div className="stack gap-6">
          <Card>
            <div className="[&>.food-art]:min-h-[220px]">
              <FoodArt variant={recipeArt(recipe.title)} label={recipe.imageUrl ? undefined : "No photo yet"} imageUrl={recipe.imageUrl} />
            </div>
            {!recipe.imageUrl && (
              <CardContent>
                <h2 className="section-heading">Photo</h2>
                <p className="section-copy">JPG, PNG, WebP, GIF, or AVIF, up to 8 MB.</p>
                <input ref={photoInputRef} type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label="Recipe photo" onChange={(event) => void uploadPhoto(event)} />
                <Button className="mt-4" variant="secondary" disabled={isUploading} onClick={() => photoInputRef.current?.click()}><ImagePlus size={17} />{isUploading ? "Uploading…" : "Add a photo"}</Button>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardContent className="stack">
              <h2 className="section-heading">Details</h2>
              <label className="grid gap-2 text-sm font-bold">Title<Input ref={titleRef} defaultValue={recipe.title} maxLength={300} autoFocus /></label>
              <label className="grid gap-2 text-sm font-bold">Description<textarea ref={descriptionRef} className="input min-h-24 resize-y" maxLength={2000} defaultValue={recipe.description ?? ""} /></label>
              <div className="grid grid-cols-3 gap-3">
                <label className="grid gap-2 text-sm font-bold">Servings<Input ref={servingsRef} inputMode="decimal" defaultValue={recipe.servings} /></label>
                <label className="grid gap-2 text-sm font-bold">Prep min<Input ref={prepTimeRef} inputMode="numeric" defaultValue={recipe.prepTimeMinutes} /></label>
                <label className="grid gap-2 text-sm font-bold">Cook min<Input ref={cookTimeRef} inputMode="numeric" defaultValue={recipe.cookTimeMinutes} /></label>
              </div>
              <div className="grid gap-2 text-sm font-bold">
                <label htmlFor="recipe-tag-input">Tags</label>
                {tags.length > 0 && (
                  <div className="cluster">
                    {tags.map((tag) => (
                      <Badge key={tag}>
                        {tag}
                        <button type="button" className="-mr-1 grid size-6 place-items-center rounded-full hover:bg-black/10" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((existing) => existing !== tag))}><X size={12} /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    id="recipe-tag-input"
                    value={tagDraft}
                    maxLength={100}
                    placeholder="Weeknight, Vegetarian…"
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== ",") return;
                      event.preventDefault();
                      commitTagDraft();
                    }}
                  />
                  <Button variant="secondary" disabled={!tagDraft.trim()} onClick={commitTagDraft}><Plus size={16} />Add tag</Button>
                </div>
                <p className="text-xs font-normal text-muted-foreground">Press Enter or comma to add a tag.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="stack gap-6">
          <Card>
            <CardContent>
              <h2 className="section-heading">Ingredients</h2>
              <p className="section-copy">Each ingredient saves on its own. Existing grocery lists are not changed.</p>
              <div className="mt-2">{ingredients.map((ingredient) => <IngredientEditor ingredient={ingredient} key={ingredient._id} onError={onError} />)}</div>
              <form className="mt-4 flex gap-2" onSubmit={addRecipeIngredient}>
                <Input value={newIngredient} maxLength={300} onChange={(event) => setNewIngredient(event.target.value)} placeholder="Add a recipe ingredient" aria-label="New ingredient" />
                <Button type="submit" variant="secondary" disabled={!newIngredient.trim()}><Plus size={16} />Add</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="section-heading">Instructions</h2>
              <label className="mt-1 grid gap-3 text-sm text-muted-foreground"><span><span className="sr-only">Instructions. </span>One step per line.</span><textarea ref={instructionsRef} className="input min-h-64 resize-y text-foreground" defaultValue={recipe.instructions.map((instruction) => instruction.text).join("\n")} /></label>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
