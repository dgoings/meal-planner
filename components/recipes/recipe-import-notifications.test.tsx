import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeImportNotifications } from "./recipe-import-notifications";

const mocks = vi.hoisted(() => ({
  imports: [] as Array<Record<string, unknown>>,
  addToBook: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args?: { recipeId: string }) => args
    ? {
        recipe: {
          _id: args.recipeId,
          title: "Lemon pasta",
          description: "Bright and quick.",
          sourceSite: "example.com",
          categories: ["Dinner"],
          cuisines: [],
          instructions: [{ position: 1, text: "Boil the pasta." }],
        },
        ingredients: [{ _id: "ingredient-1", originalText: "8 oz pasta" }],
        saved: null,
      }
    : mocks.imports,
  useMutation: () => mocks.addToBook,
}));

describe("RecipeImportNotifications", () => {
  beforeEach(() => {
    mocks.imports = [];
    mocks.addToBook.mockReset().mockResolvedValue(null);
  });

  it("keeps processing visible and offers the recipe when the import completes", async () => {
    mocks.imports = [{ _id: "import-1", status: "processing" }];
    const { rerender } = render(<RecipeImportNotifications />);
    expect(await screen.findByText("Creating your recipe card")).toBeInTheDocument();

    mocks.imports = [{ _id: "import-1", status: "completed", recipeId: "recipe-1" }];
    rerender(<RecipeImportNotifications />);
    await waitFor(() => expect(screen.queryByText("Creating your recipe card")).not.toBeInTheDocument());
    expect(screen.getByText("Your recipe is ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View recipe" })).toBeEnabled();
  });

  it("shows one notification for multiple URLs discovered in the same email", async () => {
    mocks.imports = [
      { _id: "import-1", sourceEventId: "email-1", status: "processing" },
      { _id: "import-2", sourceEventId: "email-1", status: "processing" },
      { _id: "import-3", sourceEventId: "email-1", status: "processing" },
    ];

    render(<RecipeImportNotifications />);

    expect(await screen.findAllByText("Creating your recipe card")).toHaveLength(1);
  });

  it("uses the same failure language as the Discover link importer", async () => {
    const { rerender } = render(<RecipeImportNotifications />);
    mocks.imports = [{
      _id: "import-1",
      status: "failed",
      errorMessage: "recipe_scrape_failed",
    }];
    rerender(<RecipeImportNotifications />);

    expect(await screen.findByText("Recipe import failed")).toBeInTheDocument();
    expect(screen.getByText("We couldn’t scrape a complete recipe from that website.")).toBeInTheDocument();
  });

  it("explains a retry refused for lack of an AI key", async () => {
    mocks.addToBook.mockRejectedValue(new ConvexError({ code: "ai_key_missing" }));
    const { rerender } = render(<RecipeImportNotifications />);
    mocks.imports = [{
      _id: "import-1",
      status: "failed",
      errorMessage: "ai_key_missing",
      aiErrorCode: "ai_key_missing",
    }];
    rerender(<RecipeImportNotifications />);

    expect(
      await screen.findByText("Add an AI key in Settings to import this recipe, then choose Try again."),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Add an AI key in Settings, then try again.")).toBeInTheDocument();
    expect(screen.queryByText(/can’t be retried again/)).not.toBeInTheDocument();
  });
});
