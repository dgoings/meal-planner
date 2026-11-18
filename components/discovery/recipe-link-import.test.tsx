import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeLinkImport } from "./recipe-link-import";

const mocks = vi.hoisted(() => ({
  queueUrl: vi.fn(),
  push: vi.fn(),
  result: {
    status: "completed",
    recipeId: "recipe-123",
    title: "Favorite recipe",
    description: "A complete imported recipe.",
    sourceUrl: "https://example.com/favorite-recipe",
  },
  aiSettings: undefined as undefined | { encryptionAvailable: boolean; settings: null | object },
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.queueUrl,
  useQuery: (_query: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (typeof args === "object" && args !== null && "importId" in args) return mocks.result;
    return mocks.aiSettings;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("RecipeLinkImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueUrl.mockReset().mockResolvedValue("import-123");
    mocks.aiSettings = { encryptionAvailable: true, settings: { provider: "anthropic" } };
    mocks.result.status = "completed";
    mocks.result.recipeId = "recipe-123";
    delete (mocks.result as typeof mocks.result & { errorMessage?: string }).errorMessage;
  });

  it("shows a pasted recipe result and opens its unsaved preview", async () => {
    const user = userEvent.setup();
    const { container } = render(<RecipeLinkImport />);

    const input = screen.getByRole("textbox", { name: "Recipe URL" });
    expect(container.firstElementChild).toHaveClass("discovery-import-card");
    expect(screen.getByRole("heading", { name: "Paste a recipe link" })).toHaveClass("font-display", "text-3xl", "font-semibold", "tracking-tight");
    expect(container.querySelector(".card-content")).toHaveClass("discovery-import-content");
    await user.type(input, "https://example.com/favorite-recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    await waitFor(() => expect(mocks.queueUrl).toHaveBeenCalledWith({
      sourceUrl: "https://example.com/favorite-recipe",
    }));
    expect(input).toHaveValue("");
    expect(screen.getByRole("dialog", { name: "Recipe result" })).toHaveTextContent("Favorite recipe");
    await user.click(screen.getByRole("button", { name: "Choose recipe" }));
    expect(mocks.push).toHaveBeenCalledWith("/app/recipes/recipe-123");
  });

  it("shows a useful error when the recipe cannot be queued", async () => {
    mocks.queueUrl.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    render(<RecipeLinkImport />);

    await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check the URL and try again");
  });

  it("shows the standard import failure when scraping does not produce a recipe", async () => {
    mocks.result.status = "failed";
    mocks.result.recipeId = "";
    (mocks.result as typeof mocks.result & { errorMessage?: string }).errorMessage =
      "recipe_scrape_failed";
    const user = userEvent.setup();
    render(<RecipeLinkImport />);

    await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Recipe import failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t scrape a complete recipe from that website.",
    );
  });

  it("asks for an AI key when the import is refused for lack of one", async () => {
    mocks.queueUrl.mockRejectedValue(new ConvexError({ code: "ai_key_missing" }));
    const user = userEvent.setup();
    render(<RecipeLinkImport />);

    await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Add an AI key to import recipes");
    expect(alert).toHaveTextContent(
      "Recipe import runs on your own AI provider key. Add one in Settings, then paste the link again.",
    );
    expect(screen.getByRole("link", { name: "Go to Settings" })).toHaveAttribute(
      "href",
      "/app/settings#ai-provider",
    );
  });

  it("notes that import needs a key only while none is saved", () => {
    const notice = (_: string, element: Element | null) =>
      element?.tagName === "P" &&
      element.textContent === "Recipe import needs your AI provider key. Add one in Settings.";
    const { rerender } = render(<RecipeLinkImport />);
    expect(screen.queryByText(notice)).not.toBeInTheDocument();

    mocks.aiSettings = { encryptionAvailable: true, settings: null };
    rerender(<RecipeLinkImport />);
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add one in Settings." })).toHaveAttribute(
      "href",
      "/app/settings#ai-provider",
    );
  });

  it("explains a retry refused for lack of a key", async () => {
    mocks.result.status = "failed";
    mocks.result.recipeId = "";
    (mocks.result as typeof mocks.result & { errorMessage?: string }).errorMessage = "ai_key_missing";
    mocks.queueUrl
      .mockResolvedValueOnce("import-123")
      .mockRejectedValueOnce(new ConvexError({ code: "ai_key_missing" }));
    const user = userEvent.setup();
    render(<RecipeLinkImport />);

    await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/recipe");
    await user.click(screen.getByRole("button", { name: "Import recipe" }));
    const dialog = await screen.findByRole("dialog", { name: "Recipe result" });
    expect(dialog).toHaveTextContent(
      "Add an AI key in Settings to import this recipe, then choose Try again.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Add an AI key in Settings, then try again.")).toBeInTheDocument();
  });
});
