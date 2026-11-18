import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiProviderSection } from "./ai-provider-section";

type Settings = {
  provider: "anthropic" | "openai" | "openrouter";
  model: string | null;
  effectiveModel: string;
  keyHint: string;
  needsNewKey: boolean;
  updatedAt: number;
};

const mocks = vi.hoisted(() => ({
  state: undefined as undefined | null | { encryptionAvailable: boolean; settings: Settings | null },
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { aiSettings: { get: "aiSettingsGet", save: "aiSettingsSave", remove: "aiSettingsRemove" } },
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.state,
  useAction: () => mocks.save,
  useMutation: () => mocks.remove,
}));

const KEY = "sk-test-0000-1a2b";
const saved: Settings = {
  provider: "anthropic",
  model: null,
  effectiveModel: "claude-sonnet-5",
  keyHint: "1a2b",
  needsNewKey: false,
  updatedAt: 1,
};

describe("AiProviderSection", () => {
  beforeEach(() => {
    mocks.state = { encryptionAvailable: true, settings: null };
    mocks.save.mockReset().mockResolvedValue({ provider: "anthropic", model: null, keyHint: "1a2b" });
    mocks.remove.mockReset().mockResolvedValue(null);
  });

  it("saves a new Anthropic key with the default model", async () => {
    const user = userEvent.setup();
    render(<AiProviderSection />);

    expect(screen.getByText("No key saved. Recipe import is off until you add one.")).toBeInTheDocument();
    const keyInput = screen.getByLabelText("API key");
    expect(keyInput).toHaveAttribute("type", "password");
    expect(keyInput).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("Model")).toHaveAttribute("placeholder", "claude-sonnet-5");

    await user.type(keyInput, KEY);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.save).toHaveBeenCalledWith({ provider: "anthropic", model: undefined, apiKey: KEY });
    await waitFor(() => expect(keyInput).toHaveValue(""));
    expect(await screen.findByText("Key saved.")).toBeInTheDocument();
  });

  it("requires a model for OpenAI before calling save", async () => {
    const user = userEvent.setup();
    render(<AiProviderSection />);

    await user.selectOptions(screen.getByLabelText("Provider"), "openai");
    expect(screen.getByLabelText("Model")).toHaveAttribute("placeholder", "gpt-6-luna");
    await user.type(screen.getByLabelText("API key"), KEY);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a model for OpenAI.");
    expect(mocks.save).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Provider"), "openrouter");
    expect(screen.getByLabelText("Model")).toHaveAttribute("placeholder", "anthropic/claude-haiku-5.5");
  });

  it("shows a saved key by its hint and keeps it when the key field is blank", async () => {
    mocks.state = { encryptionAvailable: true, settings: saved };
    const user = userEvent.setup();
    render(<AiProviderSection />);

    expect(screen.getByText("Saved: Anthropic · claude-sonnet-5 · key ending 1a2b")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveAttribute(
      "placeholder",
      "Saved key ending 1a2b. Leave blank to keep it.",
    );
    await user.type(screen.getByLabelText("Model"), "claude-x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.save).toHaveBeenCalledWith({ provider: "anthropic", model: "claude-x", apiKey: undefined });
  });

  it("disables the form while the key is checked", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    render(<AiProviderSection />);

    await user.type(screen.getByLabelText("API key"), KEY);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Checking key…" })).toBeDisabled();
    expect(screen.getByLabelText("API key")).toBeDisabled();
    finish({ provider: "anthropic", model: null, keyHint: "1a2b" });
    expect(await screen.findByText("Key saved.")).toBeInTheDocument();
  });

  it("explains a rejected key", async () => {
    mocks.save.mockRejectedValue(new ConvexError({ code: "ai_key_invalid" }));
    const user = userEvent.setup();
    render(<AiProviderSection />);

    await user.type(screen.getByLabelText("API key"), KEY);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your AI provider rejected your key. Check it and try again.",
    );
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("names the provider when it cannot be reached", async () => {
    mocks.save.mockRejectedValue(new ConvexError({ code: "ai_provider_unreachable" }));
    const user = userEvent.setup();
    render(<AiProviderSection />);

    await user.type(screen.getByLabelText("API key"), KEY);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t reach Anthropic to check your key. Try again.",
    );
  });

  it("removes a saved key", async () => {
    mocks.state = { encryptionAvailable: true, settings: saved };
    const user = userEvent.setup();
    render(<AiProviderSection />);

    await user.click(screen.getByRole("button", { name: "Remove key" }));
    expect(mocks.remove).toHaveBeenCalledWith({});
    expect(await screen.findByText("Key removed. AI features are off.")).toBeInTheDocument();
  });

  it("asks for a key that can no longer be read", () => {
    mocks.state = { encryptionAvailable: true, settings: { ...saved, needsNewKey: true } };
    render(<AiProviderSection />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your saved key can no longer be read. Paste it again.",
    );
  });

  it("disables the form when this deployment cannot store keys", () => {
    mocks.state = { encryptionAvailable: false, settings: null };
    render(<AiProviderSection />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "AI features aren’t available on this PerfectPlate deployment right now.",
    );
    expect(screen.getByLabelText("API key")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
