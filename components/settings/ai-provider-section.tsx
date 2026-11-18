"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { isAiErrorCode, type AiErrorCode } from "@/convex/lib/aiErrorCodes";
import {
  AI_MODEL_SUGGESTIONS,
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  DEFAULT_ANTHROPIC_MODEL,
  type AiProvider,
} from "@/convex/lib/aiModel";
import { AI_ERROR_COPY, convexErrorCode } from "@/lib/recipe-import-errors";

const KEY_PAGES: Record<AiProvider, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  openrouter: "https://openrouter.ai/keys",
};

const MODEL_HELP: Record<AiProvider, string> = {
  anthropic: `Leave blank to use ${DEFAULT_ANTHROPIC_MODEL}.`,
  openai: "Required. Use a model that supports structured output.",
  openrouter: "Required. Use the vendor/model ID from OpenRouter.",
};

/** What a failed save means, in the words of the Settings form. */
function saveErrorMessage(code: AiErrorCode | undefined, provider: AiProvider) {
  const name = AI_PROVIDER_LABELS[provider];
  switch (code) {
    case "ai_key_invalid":
      return "Your AI provider rejected your key. Check it and try again.";
    case "ai_key_no_credit":
      return `Your ${name} account is out of credit or over its spending limit. Add credit, then save again.`;
    case "ai_rate_limited":
      return `${name} is limiting requests right now. Wait a minute, then save again.`;
    case "ai_model_not_found":
      return `${name} doesn’t recognise that model. Check the model name.`;
    case "ai_model_no_structured_output":
      return "That model can’t return structured recipe data. Choose a different model.";
    case "ai_model_required":
      return `Enter a model for ${name}.`;
    case "ai_key_missing":
      return "Paste your API key.";
    case "ai_key_unreadable":
      return "Your saved key can no longer be read. Paste it again.";
    case "ai_provider_unreachable":
      return `We couldn’t reach ${name} to check your key. Try again.`;
    case "ai_provider_error":
      return `${name} couldn’t check your key. Check your provider account, then try again.`;
    case undefined:
      return "Your AI settings couldn’t be saved. Try again.";
    default:
      return AI_ERROR_COPY[code];
  }
}

type Saved = {
  provider: AiProvider;
  model: string | null;
  effectiveModel: string;
  keyHint: string;
  needsNewKey: boolean;
};

export function AiProviderSection() {
  const state = useQuery(api.aiSettings.get, {});

  return (
    <Card id="ai-provider">
      <CardContent>
        <div className="flex gap-3">
          <KeyRound className="shrink-0 text-primary" />
          <div>
            <h2 className="section-heading">AI provider</h2>
            <p className="section-copy">
              PerfectPlate reads recipes with your own AI provider key. Calls are billed to your provider
              account, so set a spending limit there.
            </p>
          </div>
        </div>
        {state === undefined ? (
          <div className="mt-5" role="status" aria-live="polite">
            <span className="sr-only">Loading AI provider settings…</span>
            <Skeleton className="h-40" />
          </div>
        ) : state === null ? null : (
          <AiProviderForm encryptionAvailable={state.encryptionAvailable} saved={state.settings} />
        )}
      </CardContent>
    </Card>
  );
}

function AiProviderForm({
  encryptionAvailable,
  saved,
}: {
  encryptionAvailable: boolean;
  saved: Saved | null;
}) {
  const save = useAction(api.aiSettings.save);
  const remove = useMutation(api.aiSettings.remove);
  const [provider, setProvider] = useState<AiProvider>(saved?.provider ?? "anthropic");
  const [model, setModel] = useState(saved?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "removing" | "removed" | "error">("idle");
  const [error, setError] = useState("");

  const busy = status === "saving" || status === "removing";
  const disabled = !encryptionAvailable || busy;
  const keepsSavedKey = saved !== null && saved.provider === provider && !saved.needsNewKey;

  function edited() {
    if (status !== "saving" && status !== "removing") setStatus("idle");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedModel = model.trim();
    if (provider !== "anthropic" && trimmedModel === "") {
      setError(saveErrorMessage("ai_model_required", provider));
      setStatus("error");
      return;
    }
    const trimmedKey = apiKey.trim();
    setStatus("saving");
    setError("");
    try {
      await save({
        provider,
        model: trimmedModel === "" ? undefined : trimmedModel,
        apiKey: trimmedKey === "" ? undefined : trimmedKey,
      });
      setModel(trimmedModel);
      setStatus("saved");
    } catch (saveError) {
      const code = convexErrorCode(saveError);
      setError(saveErrorMessage(isAiErrorCode(code) ? code : undefined, provider));
      setStatus("error");
    } finally {
      setApiKey("");
    }
  }

  async function removeKey() {
    setStatus("removing");
    setError("");
    try {
      await remove({});
      setStatus("removed");
    } catch {
      setError("Your key couldn’t be removed. Try again.");
      setStatus("error");
    }
  }

  return (
    <form className="mt-5" onSubmit={submit}>
      {!encryptionAvailable && (
        <Alert className="mb-4 border-red-200 bg-red-50" role="alert">
          <AlertTitle>AI keys unavailable</AlertTitle>
          <AlertDescription>{AI_ERROR_COPY.ai_not_configured}</AlertDescription>
        </Alert>
      )}
      {encryptionAvailable && saved?.needsNewKey && (
        <Alert className="mb-4 border-red-200 bg-red-50" role="alert">
          <AlertTitle>Key needs to be entered again</AlertTitle>
          <AlertDescription>Your saved key can no longer be read. Paste it again.</AlertDescription>
        </Alert>
      )}
      <p className="text-sm font-bold" role="status">
        {saved === null || status === "removed"
          ? "No key saved. Recipe import is off until you add one."
          : `Saved: ${AI_PROVIDER_LABELS[saved.provider]} · ${saved.effectiveModel} · key ending ${saved.keyHint}`}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          Provider
          <select
            className="h-11 w-full rounded-lg border border-border bg-white px-3 font-normal"
            value={provider}
            disabled={disabled}
            onChange={(event) => { setProvider(event.target.value as AiProvider); edited(); }}
          >
            {AI_PROVIDERS.map((option) => (
              <option key={option} value={option}>{AI_PROVIDER_LABELS[option]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Model
          <Input
            value={model}
            maxLength={200}
            spellCheck={false}
            autoComplete="off"
            placeholder={AI_MODEL_SUGGESTIONS[provider]}
            disabled={disabled}
            aria-describedby="ai-model-help"
            onChange={(event) => { setModel(event.target.value); edited(); }}
          />
        </label>
      </div>
      <p id="ai-model-help" className="mt-2 text-xs text-muted-foreground">{MODEL_HELP[provider]}</p>
      <label className="mt-4 grid gap-2 text-sm font-bold">
        API key
        <Input
          type="password"
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          maxLength={500}
          placeholder={keepsSavedKey ? `Saved key ending ${saved.keyHint}. Leave blank to keep it.` : "Paste your API key"}
          disabled={disabled}
          aria-describedby="ai-key-help"
          onChange={(event) => { setApiKey(event.target.value); edited(); }}
        />
      </label>
      <p id="ai-key-help" className="mt-2 text-xs text-muted-foreground">
        Create a key on the{" "}
        <a className="font-bold text-primary underline" href={KEY_PAGES[provider]} target="_blank" rel="noreferrer">
          {AI_PROVIDER_LABELS[provider]} keys page
        </a>
        . Your key is stored encrypted and is never shown again.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled}>{status === "saving" ? "Checking key…" : "Save"}</Button>
        {saved !== null && status !== "removed" && (
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => void removeKey()}>
            {status === "removing" ? "Removing…" : "Remove key"}
          </Button>
        )}
        {status === "saved" && <p className="text-sm font-bold text-primary" role="status">Key saved.</p>}
        {status === "removed" && <p className="text-sm font-bold text-primary" role="status">Key removed. AI features are off.</p>}
        {status === "error" && <p className="text-sm font-bold text-red-700" role="alert">{error}</p>}
      </div>
    </form>
  );
}
