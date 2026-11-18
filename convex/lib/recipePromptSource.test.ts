import { describe, expect, it } from "vitest";
import {
  MAX_PROMPT_MARKDOWN_CHARACTERS,
  MAX_PROMPT_MARKDOWN_WITH_JSON_LD_CHARACTERS,
  promptMarkdown,
} from "./recipePromptSource";

const recipe = `# Soup\n\n${"Stir the pot. ".repeat(300).trim()}`;

describe("promptMarkdown", () => {
  it("drops the reader discussion after the recipe", () => {
    const page = `${recipe}\n\n## 312 Comments\n\nLoved it!`;
    expect(promptMarkdown(page, false)).toBe(recipe);
  });

  it("recognizes review and reply headings", () => {
    expect(promptMarkdown(`${recipe}\n### Leave a Reply\nhi`, false)).toBe(recipe);
    expect(promptMarkdown(`${recipe}\n## Reviews\n5 stars`, false)).toBe(recipe);
  });

  it("keeps an early discussion heading, which is likely page chrome", () => {
    const page = `## Comments\n\n${recipe}`;
    expect(promptMarkdown(page, false)).toBe(page);
  });

  it("does not cut at a heading that only mentions reviews", () => {
    const page = `${recipe}\n## Reviewer notes on texture\nSilky.`;
    expect(promptMarkdown(page, false)).toBe(page);
  });

  it("caps markdown more tightly when JSON-LD is also supplied", () => {
    const long = "a".repeat(100_000);
    expect(promptMarkdown(long, false)).toHaveLength(MAX_PROMPT_MARKDOWN_CHARACTERS);
    expect(promptMarkdown(long, true)).toHaveLength(
      MAX_PROMPT_MARKDOWN_WITH_JSON_LD_CHARACTERS,
    );
  });
});
