"use client";

import { useMutation, useQuery } from "convex/react";
import { BookPlus, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AI_SETTINGS_HREF } from "@/components/discovery/ai-key-note";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { recipeImportFailureMessage } from "@/lib/recipe-import-errors";

export function ImportResultDialog({
  importId,
  open,
  onOpenChange,
}: {
  importId: Id<"recipeImports"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const retryImport = useMutation(api.recipeIngestion.retryImport);
  const [retryFailed, setRetryFailed] = useState<string | null>(null);

  async function retry() {
    if (importId === null) return;
    setRetryFailed(null);
    try {
      await retryImport({ importId });
    } catch {
      setRetryFailed("This link can’t be retried again.");
    }
  }
  const importResult = useQuery(
    api.email.importResult,
    importId === null ? "skip" : { importId },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,640px)]">
        <DialogTitle>Recipe result</DialogTitle>
        <DialogDescription>
          Choose the result to open its recipe page before deciding whether to save it.
        </DialogDescription>
        {importResult?.status === "failed" ? (
          <Alert className="mt-5 border-red-300 bg-red-50 text-red-900" role="alert">
            <AlertTitle>Recipe import failed</AlertTitle>
            <AlertDescription>{recipeImportFailureMessage(importResult.errorMessage, importResult.aiErrorCode)}</AlertDescription>
            {importResult.aiErrorCode !== undefined && (
              <p className="mt-2 text-sm"><Link className="font-bold underline" href={AI_SETTINGS_HREF}>Go to Settings</Link></p>
            )}
            {retryFailed
              ? <p className="mt-3 text-sm font-bold">{retryFailed}</p>
              : <Button className="mt-3" size="sm" variant="secondary" onClick={() => void retry()}><RotateCcw size={16} />Try again</Button>}
          </Alert>
        ) : importResult?.recipeId ? (
          <Card className="mt-5">
            <CardContent className="stack p-5">
              <div>
                <h3>{importResult.title ?? "Imported recipe"}</h3>
                {importResult.description && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{importResult.description}</p>
                )}
              </div>
              <Button onClick={() => router.push(`/app/recipes/${importResult.recipeId}`)}>
                <BookPlus size={16} />
                Choose recipe
              </Button>
            </CardContent>
          </Card>
        ) : (
          <p className="mt-5 flex items-center gap-2 rounded-lg bg-primary-soft p-4 text-sm font-semibold text-primary" role="status">
            <LoaderCircle className="animate-spin" size={17} />
            Reading the recipe and preparing your result…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
