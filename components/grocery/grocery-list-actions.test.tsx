import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroceryListActions } from "./grocery-list-actions";

const mocks = vi.hoisted(() => ({
  combineLists: vi.fn(),
  removeList: vi.fn(),
  updateList: vi.fn(),
  lists: [] as Array<{ _id: string; name: string; status?: string }>,
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.lists,
  useMutation: (reference: string) =>
    reference === "combineLists"
      ? mocks.combineLists
      : reference === "updateList"
        ? mocks.updateList
        : mocks.removeList,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    groceryLists: {
      listMine: "listMine",
      combineLists: "combineLists",
      removeList: "removeList",
      updateList: "updateList",
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

describe("GroceryListActions", () => {
  beforeEach(() => {
    mocks.combineLists.mockReset();
    mocks.removeList.mockReset();
    mocks.updateList.mockReset();
    mocks.lists = [
      { _id: "list-1", name: "Dinner" },
      { _id: "list-2", name: "Weekend" },
    ];
    mocks.push.mockReset();
    mocks.replace.mockReset();
  });

  it("creates a combined list and opens it", async () => {
    const user = userEvent.setup();
    mocks.combineLists.mockResolvedValueOnce("combined-list");
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Combine lists" }));
    expect(
      screen.queryByRole("option", { name: "Choose a list" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Combine with")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Create combined list" }),
    ).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Combine with"), "list-2");
    const listName = screen.getByLabelText("New list name");
    expect(listName).toHaveValue("Dinner + Weekend");
    await user.clear(listName);
    await user.type(listName, "Weekly shop");
    await user.click(
      screen.getByRole("button", { name: "Create combined list" }),
    );

    expect(mocks.combineLists).toHaveBeenCalledWith(
      expect.objectContaining({
        listId: "list-1",
        otherListId: "list-2",
        name: "Weekly shop",
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/app/grocery-lists/combined-list",
    );
  });

  it("supports menu focus, arrow navigation, typeahead, and Escape", async () => {
    const user = userEvent.setup();
    render(<GroceryListActions listId="list-1" listName="Dinner" />);
    const trigger = screen.getByRole("button", { name: "More options for Dinner" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const combine = screen.getByRole("menuitem", { name: "Combine lists" });
    const archive = screen.getByRole("menuitem", { name: "Archive list" });
    const remove = screen.getByRole("menuitem", { name: "Delete list" });
    expect(combine).toHaveFocus();
    expect(screen.getByRole("menu", { name: "More options for Dinner" })).toHaveAttribute("id", trigger.getAttribute("aria-controls"));
    await user.keyboard("{ArrowDown}");
    expect(archive).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(remove).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(combine).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(remove).toHaveFocus();
    await user.keyboard("{Home}");
    expect(combine).toHaveFocus();
    await user.keyboard("{End}");
    expect(remove).toHaveFocus();
    await user.keyboard("c");
    expect(combine).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Delete list" })).toHaveFocus();
  });

  it("dismisses on Tab, Shift+Tab, and outside clicks without trapping focus", async () => {
    const user = userEvent.setup();
    render(<><button>Before</button><GroceryListActions listId="list-1" /><button>After</button></>);
    const trigger = screen.getByRole("button", { name: "More list options" });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "After" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("returns focus to the options button after cancelling a dialog", async () => {
    const user = userEvent.setup();
    render(<GroceryListActions listId="list-1" />);
    const trigger = screen.getByRole("button", { name: "More list options" });
    await user.click(trigger);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
  });

  it("archives a list without confirmation and returns to the overview", async () => {
    const user = userEvent.setup();
    mocks.updateList.mockResolvedValueOnce(null);
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive list" }));

    expect(mocks.updateList).toHaveBeenCalledWith({ listId: "list-1", status: "archived" });
    expect(mocks.removeList).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/app/grocery-lists");
  });

  it("offers restore instead of archive and combine on an archived list", async () => {
    const user = userEvent.setup();
    mocks.lists = [
      { _id: "list-1", name: "Dinner", status: "archived" },
      { _id: "list-2", name: "Weekend", status: "active" },
    ];
    mocks.updateList.mockResolvedValueOnce(null);
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    expect(screen.queryByRole("menuitem", { name: "Combine lists" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Archive list" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Restore list" }));

    expect(mocks.updateList).toHaveBeenCalledWith({ listId: "list-1", status: "active" });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("leaves archived lists out of the combine choices", async () => {
    const user = userEvent.setup();
    mocks.lists = [
      { _id: "list-1", name: "Dinner", status: "active" },
      { _id: "list-2", name: "Weekend", status: "archived" },
      { _id: "list-3", name: "Party", status: "active" },
    ];
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Combine lists" }));

    expect(screen.getByRole("option", { name: "Party" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Weekend" })).not.toBeInTheDocument();
  });

  it("reports a failed archive", async () => {
    const user = userEvent.setup();
    mocks.updateList.mockRejectedValueOnce(new Error("offline"));
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive list" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t archive this list");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("confirms deletion and returns to the grocery-list overview", async () => {
    const user = userEvent.setup();
    mocks.removeList.mockResolvedValueOnce(null);
    render(<GroceryListActions listId="list-1" />);

    await user.click(screen.getByRole("button", { name: "More list options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete list" }));
    await user.click(screen.getByRole("button", { name: "Delete list" }));

    expect(mocks.removeList).toHaveBeenCalledWith({ listId: "list-1" });
    expect(mocks.replace).toHaveBeenCalledWith("/app/grocery-lists");
  });
});
