import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { NutritionPerServing } from "@/convex/lib/nutrition";
import { RecipeNutrition } from "./recipe-nutrition";

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), message: vi.fn() }));

vi.mock("convex/react", () => ({ useMutation: () => mocks.mutation }));

const recipeId = "recipe-1" as Id<"recipes">;

function Harness({ nutrition, canEdit = true, startEditing = false }: { nutrition?: NutritionPerServing; canEdit?: boolean; startEditing?: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  return (
    <RecipeNutrition
      recipeId={recipeId}
      nutrition={nutrition}
      canEdit={canEdit}
      editing={editing}
      onEditingChange={setEditing}
      onMessage={mocks.message}
    />
  );
}

describe("RecipeNutrition", () => {
  beforeEach(() => {
    mocks.mutation.mockReset().mockResolvedValue(null);
    mocks.message.mockReset();
  });

  it("shows the figures in order with their units, calories and protein first", () => {
    render(
      <Harness
        canEdit={false}
        nutrition={{ sodiumMg: 1200, fiberG: 0.3, calories: 270, proteinG: 12, fatG: 9.25, source: "page" }}
      />,
    );
    const block = screen.getByRole("region", { name: "Nutrition per serving" });
    expect(within(block).getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Calories",
      "Protein",
      "Fat",
      "Fiber",
      "Sodium",
    ]);
    expect(within(block).getAllByRole("definition").map((value) => value.textContent)).toEqual([
      "270kcal",
      "12g",
      "9.3g",
      "0.3g",
      "1,200mg",
    ]);
    expect(within(block).queryByText("Estimated")).not.toBeInTheDocument();
    expect(within(block).queryByRole("button")).not.toBeInTheDocument();
  });

  it("labels estimated figures", () => {
    render(<Harness canEdit={false} nutrition={{ calories: 400, source: "estimate" }} />);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
  });

  it("renders nothing without figures unless the owner is adding them", () => {
    const { container } = render(<Harness />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets the owner edit figures, where a blank clears one", async () => {
    const user = userEvent.setup();
    render(<Harness nutrition={{ calories: 270, proteinG: 12, source: "page" }} />);
    await user.click(screen.getByRole("button", { name: "Edit nutrition" }));

    const calories = screen.getByLabelText("Calories (kcal)");
    expect(calories).toHaveValue("270");
    expect(calories).toHaveAttribute("inputmode", "decimal");
    await user.clear(screen.getByLabelText("Protein (g)"));
    await user.type(screen.getByLabelText("Sodium (mg)"), "450");
    await user.type(screen.getByLabelText("Fiber (g)"), "2,5");
    await user.click(screen.getByRole("button", { name: "Save nutrition" }));

    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId, figures: { calories: 270, fiberG: 2.5, sodiumMg: 450 } });
    expect(mocks.message).toHaveBeenCalledWith("Nutrition saved.");
    expect(screen.queryByLabelText("Calories (kcal)")).not.toBeInTheDocument();
  });

  it("removes the nutrition when every figure is cleared", async () => {
    const user = userEvent.setup();
    render(<Harness nutrition={{ calories: 270, source: "manual" }} startEditing />);
    await user.clear(screen.getByLabelText("Calories (kcal)"));
    await user.click(screen.getByRole("button", { name: "Save nutrition" }));
    expect(mocks.mutation).toHaveBeenCalledWith({ recipeId, figures: {} });
    expect(mocks.message).toHaveBeenCalledWith("Nutrition removed.");
  });

  it("explains a figure that is not a usable number, without saving", async () => {
    const user = userEvent.setup();
    render(<Harness startEditing />);
    await user.type(screen.getByLabelText("Protein (g)"), "lots");
    await user.click(screen.getByRole("button", { name: "Save nutrition" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Protein must be a number from 0 to 500, or left blank.");
    expect(screen.getByLabelText("Protein (g)")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
