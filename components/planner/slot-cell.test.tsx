import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { DayCard } from "./day-card";
import type { SlotView } from "./types";

type Ref = Parameters<typeof getFunctionName>[0];

const mocks = vi.hoisted(() => ({ mutations: {} as Record<string, ReturnType<typeof vi.fn>> }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: (ref: Ref) => {
    const name = getFunctionName(ref);
    mocks.mutations[name] ??= vi.fn().mockResolvedValue({ type: "cook", name: "" });
    return mocks.mutations[name];
  },
}));

const plannerId = "planner-1" as Id<"planners">;
const mutation = (name: string) => {
  mocks.mutations[`planner:${name}`] ??= vi.fn().mockResolvedValue({ type: "cook", name: "" });
  return mocks.mutations[`planner:${name}`];
};

function renderDays(dates: string[], slots: SlotView[] = []) {
  const requestFocus = (id: string) => document.getElementById(id)?.focus();
  return render(
    <ul>
      {dates.map((date) => (
        <DayCard key={date} plannerId={plannerId} date={date} today={false} weekStart="2026-11-16" slots={slots} requestFocus={requestFocus} />
      ))}
    </ul>,
  );
}

const input = (name: string) => screen.getByRole("combobox", { name });

describe("SlotCell editing", () => {
  beforeEach(() => {
    mocks.mutations = {};
  });

  it("commits on Enter and moves lunch to dinner to the next day's lunch", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16", "2026-11-17"]);

    await user.type(input("Monday lunch"), "Chili{Enter}");
    expect(mutation("commitText")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });
    expect(input("Monday dinner")).toHaveFocus();

    await user.type(input("Monday dinner"), "out at Thai{Enter}");
    expect(mutation("commitText")).toHaveBeenLastCalledWith({ plannerId, date: "2026-11-16", meal: "dinner", text: "out at Thai" });
    expect(input("Tuesday lunch")).toHaveFocus();
    expect(mutation("commitText")).toHaveBeenCalledTimes(2);
  });

  it("stays on the week's last dinner", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-22"]);
    await user.type(input("Sunday dinner"), "Roast{Enter}");
    expect(input("Sunday dinner")).toHaveFocus();
  });

  it("commits on blur, once, and not when nothing changed", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }]);
    await user.click(input("Monday lunch"));
    await user.tab();
    expect(mutation("commitText")).not.toHaveBeenCalled();

    await user.type(input("Monday dinner"), "Stew");
    await user.tab();
    await act(async () => input("Monday dinner").focus());
    await user.tab();
    expect(mutation("commitText")).toHaveBeenCalledTimes(1);
  });

  it("clears a slot by pressing its selected type and focuses the slot's main control", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }]);
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    await user.click(within(lunch).getByRole("button", { name: "Cook" }));
    expect(mutation("setType")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", type: "cook" });
    await waitFor(() => expect(input("Monday lunch")).toHaveFocus());
  });

  it("chooses other leftovers from the select and focuses its input", async () => {
    const user = userEvent.setup();
    renderDays(["2026-11-16"], [
      { date: "2026-11-15", meal: "dinner", type: "cook", name: "Roast" },
      { date: "2026-11-16", meal: "lunch", type: "left", name: "", from: { date: "2026-11-15", meal: "dinner" } },
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Monday lunch is leftovers of" }), "other");
    expect(mutation("setLeftoverOf")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", from: "other" });
  });

  it("names other leftovers and moves on", async () => {
    const user = userEvent.setup();
    mutation("commitOther").mockResolvedValue({ name: "Pizza" });
    renderDays(["2026-11-16"], [{ date: "2026-11-16", meal: "lunch", type: "left", name: "", from: "other" }]);
    await user.type(input("Monday lunch leftovers"), "Pizza{Enter}");
    expect(mutation("commitOther")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", text: "Pizza" });
    expect(input("Monday dinner")).toHaveFocus();
  });

  it("shows Saving… while a change is pending and an alert when it fails, keeping the text", async () => {
    const user = userEvent.setup();
    let reject: (error: Error) => void = () => undefined;
    mutation("commitText").mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    renderDays(["2026-11-16"]);
    await user.type(input("Monday lunch"), "Chili{Enter}");
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    expect(within(lunch).getByText("Saving…")).toBeInTheDocument();
    expect(within(lunch).getByRole("button", { name: "Skip" })).toHaveAttribute("aria-disabled", "true");
    await user.click(within(lunch).getByRole("button", { name: "Skip" }));
    expect(mutation("setType")).not.toHaveBeenCalled();

    await act(async () => reject(new Error("offline")));
    expect(within(lunch).getByRole("alert")).toHaveTextContent("Couldn’t save this meal. Try again.");
    expect(input("Monday lunch")).toHaveValue("Chili");
    expect(within(lunch).getByRole("button", { name: "Skip" })).not.toHaveAttribute("aria-disabled");
  });

  it("imports a pasted link through the existing import flow and opens its result", async () => {
    const user = userEvent.setup();
    mutation("importLink").mockResolvedValue("import-1");
    const announced = vi.fn();
    window.addEventListener("perfectplate:recipe-import-started", announced);
    renderDays(["2026-11-16"]);
    await user.type(input("Monday lunch"), "https://example.com/best-chili{Enter}");
    expect(mutation("importLink")).toHaveBeenCalledWith({ plannerId, date: "2026-11-16", meal: "lunch", url: "https://example.com/best-chili" });
    expect(mutation("commitText")).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Recipe result" })).toBeInTheDocument();
    expect(announced).toHaveBeenCalledTimes(1);
    window.removeEventListener("perfectplate:recipe-import-started", announced);
  });

  it("shows where a pending import is", () => {
    const importId = "import-1" as Id<"recipeImports">;
    const recipeId = "recipe-1" as Id<"recipes">;
    renderDays(["2026-11-16"], [
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Best chili", import: { importId, status: "scraping" } },
      { date: "2026-11-16", meal: "dinner", type: "cook", name: "Soup", import: { importId, status: "needs_review", recipeId } },
    ]);
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    const dinner = screen.getByRole("region", { name: "Monday dinner" });
    expect(within(lunch).getByText("Reading the recipe…")).toBeInTheDocument();
    expect(within(dinner).getByRole("link", { name: "Review and save the recipe" })).toHaveAttribute("href", "/app/recipes/recipe-1");
  });

  it("offers the import result when an import failed", async () => {
    const user = userEvent.setup();
    const importId = "import-1" as Id<"recipeImports">;
    renderDays(["2026-11-16"], [
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Best chili", import: { importId, status: "failed" } },
    ]);
    const lunch = screen.getByRole("region", { name: "Monday lunch" });
    expect(within(lunch).getByText("The recipe couldn’t be imported.")).toBeInTheDocument();
    await user.click(within(lunch).getByRole("button", { name: "See why" }));
    expect(await screen.findByRole("dialog", { name: "Recipe result" })).toBeInTheDocument();
  });

  it("keeps focus in the input when a cleared slot's name goes away", async () => {
    const user = userEvent.setup();
    const slots: SlotView[] = [{ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" }];
    const requestFocus = (id: string) => document.getElementById(id)?.focus();
    const day = (current: SlotView[]) => (
      <ul><DayCard plannerId={plannerId} date="2026-11-16" today={false} weekStart="2026-11-16" slots={current} requestFocus={requestFocus} /></ul>
    );
    const { rerender } = render(day(slots));
    await user.click(within(screen.getByRole("region", { name: "Monday lunch" })).getByRole("button", { name: "Cook" }));
    expect(input("Monday lunch")).toHaveFocus();
    rerender(day([]));
    expect(input("Monday lunch")).toHaveFocus();
    expect(input("Monday lunch")).toHaveValue("");
    expect(input("Monday lunch")).toHaveAttribute("placeholder", "Plan lunch");
  });
});
