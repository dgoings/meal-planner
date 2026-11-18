export const MAX_PROMPT_MARKDOWN_CHARACTERS = 40_000;
export const MAX_PROMPT_MARKDOWN_WITH_JSON_LD_CHARACTERS = 15_000;
export const MAX_PROMPT_JSON_LD_CHARACTERS = 30_000;

// A heading this early is more likely a jump link or page chrome than the start
// of the reader discussion, so it is not treated as the end of the recipe.
const MIN_CONTENT_BEFORE_DISCUSSION = 2_000;

const DISCUSSION_HEADING =
  /^#{1,6}\s*(\d+\s+)?(comments?|reviews?|ratings? (and|&) reviews?|leave a (comment|reply|review)|join the (conversation|discussion)|reader (comments|reviews))\b/im;

export function promptMarkdown(markdown: string, hasJsonLd: boolean) {
  const limit = hasJsonLd
    ? MAX_PROMPT_MARKDOWN_WITH_JSON_LD_CHARACTERS
    : MAX_PROMPT_MARKDOWN_CHARACTERS;
  const tail = markdown.slice(MIN_CONTENT_BEFORE_DISCUSSION);
  const discussion = DISCUSSION_HEADING.exec(tail);
  const body =
    discussion === null
      ? markdown
      : markdown.slice(0, MIN_CONTENT_BEFORE_DISCUSSION + discussion.index);
  return body.trimEnd().slice(0, limit);
}

export function promptJsonLd(recipeJsonLd: string | undefined) {
  return recipeJsonLd?.slice(0, MAX_PROMPT_JSON_LD_CHARACTERS);
}
