import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GroceryListsPage from "./page";

vi.mock("@/convex/_generated/api", () => ({ api: { groceryLists: { listMine: "listMine", itemProgress: "itemProgress", summary: "summary" } } }));

const mocks = vi.hoisted(() => ({ extraLists: [] as unknown[] }));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    if (query === "itemProgress") return { total: 7, checked: 7 };
    if (query === "summary") return { isComplete: true };
    return [
        {
          _id: "list-123",
          name: "Weekend trip",
          status: "active",
          createdAt: 1,
          updatedAt: 2,
        },
        ...mocks.extraLists,
      ];
  },
  useMutation: () => vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe("GroceryListsPage", () => {
  afterEach(() => {
    mocks.extraLists = [];
  });

  it("keeps archived lists in a collapsed section", async () => {
    const user = userEvent.setup();
    mocks.extraLists = [
      { _id: "list-old", name: "Last month", status: "archived", createdAt: 1, updatedAt: 2 },
    ];
    render(<GroceryListsPage />);

    expect(screen.getByRole("link", { name: "Open Weekend trip" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Last month" })).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Archived lists (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Open Last month" })).toHaveAttribute(
      "href",
      "/app/grocery-lists/list-old",
    );
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("hides the archived section when nothing is archived", () => {
    render(<GroceryListsPage />);
    expect(screen.queryByRole("button", { name: /Archived lists/ })).not.toBeInTheDocument();
  });

  it("uses the new-list route for both creation entry points", () => {
    render(<GroceryListsPage />);

    expect(screen.getByRole("link", { name: "New list" })).toHaveAttribute(
      "href",
      "/app/grocery-lists/new",
    );
    expect(
      screen.getByRole("link", { name: /^Start another list/ }),
    ).toHaveAttribute("href", "/app/grocery-lists/new");
  });

  it("links saved Convex lists back to their editors", () => {
    render(<GroceryListsPage />);

    expect(screen.getByRole("link", { name: "Open Weekend trip" })).toHaveAttribute(
      "href",
      "/app/grocery-lists/list-123",
    );
    expect(screen.getByText(/0 of 7 left/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options for Weekend trip" })).toBeInTheDocument();
    expect(screen.getByText("List Completed")).toBeInTheDocument();
  });

  it("uses equal-height cards and truncates list titles", () => {
    render(<GroceryListsPage />);

    const title = screen.getByRole("heading", { name: "Weekend trip" });
    expect(title).toHaveClass("truncate");
    expect(title).toHaveAttribute("title", "Weekend trip");
    expect(title.closest(".card")).toHaveClass("h-64");

    const createCard = screen
      .getByRole("link", { name: /^Start another list/ })
      .querySelector(".card");
    expect(createCard).toHaveClass("h-64");
  });

  it("keeps the editor link focus ring inside its clipping card", () => {
    render(<GroceryListsPage />);
    expect(screen.getByRole("link", { name: "Open Weekend trip" })).toHaveClass(
      "focus-visible:ring-2",
      "focus-visible:ring-inset",
    );
  });
});
