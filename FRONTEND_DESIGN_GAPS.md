# Frontend design gaps for generated recipes

This is an implementation handoff, not a finished design specification. The
behaviors below exist and are connected to the interface, but their final
design has not been reviewed. Resolve these questions in the next `DESIGN.md`
pass.

## Recipe generation and review

- **Processing state:** presentation while the page is scraped and the
  Anthropic recipe agent converts the scraped evidence into structured data.
- **Review-needed state:** placement and hierarchy for agent warnings and
  truncated-scrape warnings.
- **Retry:** failed imports offer **Try again** in the notification and the
  result dialog. Copy for a link that has used all of its attempts, and whether
  the Recipe Inbox list should offer the same action, are undecided.

## Recipe Book cards and recipe editing

- **Recipe-card visual design:** there is no approved high-fidelity card layout
  for attribution, warning badges, the favorite control, or edited-state
  indicators.
- **Filters:** the favorites toggle and tag select are functional placeholders;
  multi-tag filtering and mobile placement are undecided.
- **Notes:** character-count feedback and autosave versus explicit save.
- **Unsaved work:** recipe editing has no navigation blocking or recovery after
  a failed edit. The grocery editor warns before the page is closed with
  unsaved changes but does not block in-app navigation.
- **Read-only recipes:** recipes a user did not import show no edit or delete
  actions. Whether to explain why, or offer "make my own copy", is undecided.

## Generated grocery lists

- **Recipe relationship:** presentation for “From [recipe]” and what remains
  when the recipe card is later removed.
- **Store sections:** items from recipes are grouped by section. Manually added
  items land in "Other", and there is no control for moving an item between
  sections.
- **Whole-list actions:** a merge replaces both source lists; undo policy and
  success feedback still need design review.
- **Optional ingredients:** an affordance for copying optional recipe
  ingredients into the grocery list later is not designed.
- **Quantity semantics:** serving-based scaling applies to numeric amounts;
  ranges and free-text amounts are copied unscaled. The recipe preview page
  (`/app/recipes/[id]`) does not yet carry its serving count into a list.

## Error and accessibility states

- Screen-reader announcements for item edits in the grocery editor.
- Keyboard interactions for ingredient/instruction reordering.
- Mobile layouts for long ingredient names, multi-line quantities, notes, and
  instruction editing.

## Backend boundary to preserve

Editing a recipe never silently rewrites an existing grocery list, and editing a
grocery item never changes the source recipe. The frontend must communicate this
separation wherever both records appear together.
