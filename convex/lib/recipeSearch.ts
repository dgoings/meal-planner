import { isLikelyIndividualRecipePage, normalizeRecipeUrl } from "./urls";

export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_SEARCH_RESULTS = 4;
export const MAX_SEARCH_CANDIDATES = 12;

// A rating backed by few votes is pulled toward this prior, so 4.6 from 2,000
// cooks outranks 5.0 from three.
const PRIOR_RATING = 4;
const PRIOR_VOTES = 25;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 300;

export type RecipeSearchResult = {
  url: string;
  title: string;
  description: string;
  source: string;
  rating?: number;
  ratingCount?: number;
};

export type RecipePageRating = {
  reachable: boolean;
  rating?: number;
  ratingCount?: number;
};

export function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function clipped(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1).trimEnd()}…` : text;
}

export function selectRecipeResults(rawResults: unknown): RecipeSearchResult[] {
  if (!Array.isArray(rawResults)) return [];
  const seen = new Set<string>();
  const selected: RecipeSearchResult[] = [];
  for (const raw of rawResults) {
    if (selected.length === MAX_SEARCH_CANDIDATES) break;
    if (typeof raw !== "object" || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const title = clipped(record.title, MAX_TITLE_LENGTH);
    if (typeof record.url !== "string" || !title) continue;

    let url: string;
    try {
      url = normalizeRecipeUrl(record.url);
    } catch {
      continue;
    }
    if (seen.has(url) || !isLikelyIndividualRecipePage(url, title)) continue;
    seen.add(url);
    selected.push({
      url,
      title,
      description: clipped(record.content, MAX_DESCRIPTION_LENGTH),
      source: new URL(url).hostname.replace(/^www\./, ""),
    });
  }
  return selected;
}

function ratingScore(page: RecipePageRating) {
  if (page.rating === undefined) return undefined;
  const votes = page.ratingCount ?? 1;
  return (
    (votes * page.rating + PRIOR_VOTES * PRIOR_RATING) / (votes + PRIOR_VOTES)
  );
}

/**
 * Order candidates best-rated first. Pages without a rating keep their search
 * relevance order after the rated ones, and pages the importer could not reach
 * go last because choosing one would most likely fail.
 */
export function rankByRating(
  candidates: RecipeSearchResult[],
  pages: RecipePageRating[],
): RecipeSearchResult[] {
  const ranked = candidates.map((candidate, index) => {
    const page = pages[index] ?? { reachable: true };
    return { candidate, page, index, score: ratingScore(page) };
  });
  ranked.sort((a, b) => {
    if (a.page.reachable !== b.page.reachable) return a.page.reachable ? -1 : 1;
    if (a.score !== undefined && b.score !== undefined && a.score !== b.score) {
      return b.score - a.score;
    }
    if ((a.score === undefined) !== (b.score === undefined)) {
      return a.score === undefined ? 1 : -1;
    }
    return a.index - b.index;
  });
  return ranked.slice(0, MAX_SEARCH_RESULTS).map(({ candidate, page }) => ({
    ...candidate,
    ...(page.rating === undefined ? {} : { rating: page.rating }),
    ...(page.ratingCount === undefined ? {} : { ratingCount: page.ratingCount }),
  }));
}
