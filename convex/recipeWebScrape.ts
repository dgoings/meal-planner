"use node";

import { load } from "cheerio";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  buildRecipeScrapePayload,
  extractRecipeJsonLd,
  extractRecipeRating,
} from "./lib/recipeScrape";
import { readBodyWithLimit } from "./lib/boundedFetch";
import { assertPublicResolution } from "./lib/publicDns";
import { isPublicUrlHostname } from "./lib/urls";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const RATING_FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const USER_AGENT =
  "Mozilla/5.0 (compatible; PerfectPlateBot/1.0; +https://perfectplate.app)";

const scrapeResult = v.object({
  markdown: v.string(),
  recipeJsonLd: v.optional(v.string()),
  imageSourceUrl: v.optional(v.string()),
  pageTitle: v.optional(v.string()),
  pageDescription: v.optional(v.string()),
  pageLanguage: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  contentType: v.optional(v.string()),
  statusCode: v.optional(v.number()),
  truncated: v.boolean(),
});

function safeRecipeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported recipe page protocol");
  }
  if (url.username || url.password) {
    throw new Error("Recipe page URL credentials are not allowed");
  }
  if (!isPublicUrlHostname(url.hostname)) {
    throw new Error("Recipe page host is not public");
  }
  return url;
}

// A lightweight markdown-ish rendering of the page's text content for the
// extraction agent. Most recipe sites also carry schema.org Recipe JSON-LD,
// which is extracted separately and is the agent's primary source; this text
// is a fallback when JSON-LD is missing or incomplete.
function htmlToMarkdown(html: string) {
  const $ = load(html);
  $("script, style, noscript, template, svg").remove();

  const parts: string[] = [];
  $("h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,td,th,caption").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    const tag = el.tagName?.toLowerCase() ?? "";
    const headingLevel = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 0;
    if (headingLevel > 0) {
      parts.push(`${"#".repeat(headingLevel)} ${text}`);
    } else if (tag === "li") {
      parts.push(`- ${text}`);
    } else {
      parts.push(text);
    }
  });
  return parts.join("\n").trim();
}

async function fetchHtml(url: URL, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  // The timer stays armed until the body is fully read; a server that sends
  // headers promptly and then stalls must not hold the action open.
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = url;
  let response: Response;
  try {
    for (let redirect = 0; ; redirect += 1) {
      try {
        await assertPublicResolution(currentUrl.hostname);
      } catch {
        throw new Error("Recipe page host is not public");
      }
      try {
        // Redirects are followed by hand so every hop is checked against the
        // same public-host rules as the original URL.
        response = await fetch(currentUrl, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
        });
      } catch {
        throw new Error(
          `recipe_scrape_failed: could not reach ${currentUrl.hostname}`,
        );
      }
      if (!REDIRECT_STATUSES.includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new Error("recipe_scrape_failed: too many or invalid redirects");
      }
      currentUrl = safeRecipeUrl(new URL(location, currentUrl).toString());
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim();
    let bytes: Uint8Array | null;
    try {
      bytes = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    } catch {
      throw new Error(
        `recipe_scrape_failed: could not read ${currentUrl.hostname}`,
      );
    }
    if (bytes === null) {
      throw new Error("recipe_scrape_failed: response was too large");
    }
    return {
      html: new TextDecoder("utf-8").decode(bytes),
      statusCode: response.status,
      contentType,
      finalUrl: currentUrl.toString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const scrapePage = internalAction({
  args: { url: v.string() },
  returns: scrapeResult,
  handler: async (_ctx, { url }) => {
    const safeUrl = safeRecipeUrl(url);
    const fetched = await fetchHtml(safeUrl);
    const $ = load(fetched.html);
    const title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").first().text().trim() ||
      undefined;
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      undefined;
    const language = $("html").attr("lang")?.trim() || undefined;
    const ogImage =
      $('meta[property="og:image"]').attr("content")?.trim() || undefined;
    const twitterImage =
      $('meta[name="twitter:image"]').attr("content")?.trim() || undefined;
    const markdown = htmlToMarkdown(fetched.html);

    return buildRecipeScrapePayload({
      markdown,
      html: fetched.html,
      metadata: {
        title,
        description,
        language,
        ogImage,
        twitterImage,
        sourceURL: fetched.finalUrl,
        statusCode: fetched.statusCode,
        contentType: fetched.contentType,
      },
    });
  },
});

export const ratingsForUrls = internalAction({
  args: { urls: v.array(v.string()) },
  returns: v.array(
    v.object({
      reachable: v.boolean(),
      rating: v.optional(v.number()),
      ratingCount: v.optional(v.number()),
    }),
  ),
  handler: async (_ctx, { urls }) =>
    await Promise.all(
      urls.map(async (url) => {
        try {
          const fetched = await fetchHtml(
            safeRecipeUrl(url),
            RATING_FETCH_TIMEOUT_MS,
          );
          if (fetched.statusCode >= 400) return { reachable: false };
          const jsonLd = extractRecipeJsonLd(fetched.html);
          return { reachable: true, ...extractRecipeRating(jsonLd?.value) };
        } catch {
          return { reachable: false };
        }
      }),
    ),
});
