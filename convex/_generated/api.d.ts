/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiSettings from "../aiSettings.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as groceryLists from "../groceryLists.js";
import type * as http from "../http.js";
import type * as lib_agentmail from "../lib/agentmail.js";
import type * as lib_aiErrorCodes from "../lib/aiErrorCodes.js";
import type * as lib_aiErrors from "../lib/aiErrors.js";
import type * as lib_aiKeyCrypto from "../lib/aiKeyCrypto.js";
import type * as lib_aiModel from "../lib/aiModel.js";
import type * as lib_aiProviderCheck from "../lib/aiProviderCheck.js";
import type * as lib_aiValidators from "../lib/aiValidators.js";
import type * as lib_boundedFetch from "../lib/boundedFetch.js";
import type * as lib_groceryCategory from "../lib/groceryCategory.js";
import type * as lib_groceryMerge from "../lib/groceryMerge.js";
import type * as lib_manualIngredient from "../lib/manualIngredient.js";
import type * as lib_nutrition from "../lib/nutrition.js";
import type * as lib_planGrocery from "../lib/planGrocery.js";
import type * as lib_plannerCopy from "../lib/plannerCopy.js";
import type * as lib_plannerRules from "../lib/plannerRules.js";
import type * as lib_plannerSlots from "../lib/plannerSlots.js";
import type * as lib_plannerValidators from "../lib/plannerValidators.js";
import type * as lib_publicDns from "../lib/publicDns.js";
import type * as lib_recipeAgentTypes from "../lib/recipeAgentTypes.js";
import type * as lib_recipeJsonLd from "../lib/recipeJsonLd.js";
import type * as lib_recipePromptSource from "../lib/recipePromptSource.js";
import type * as lib_recipeScrape from "../lib/recipeScrape.js";
import type * as lib_recipeSearch from "../lib/recipeSearch.js";
import type * as lib_slotHistory from "../lib/slotHistory.js";
import type * as lib_urls from "../lib/urls.js";
import type * as lib_userModelConfig from "../lib/userModelConfig.js";
import type * as lib_userRecipes from "../lib/userRecipes.js";
import type * as planner from "../planner.js";
import type * as plannerCopy from "../plannerCopy.js";
import type * as plannerGrocery from "../plannerGrocery.js";
import type * as plannerHistory from "../plannerHistory.js";
import type * as recipeAgent from "../recipeAgent.js";
import type * as recipeAgentData from "../recipeAgentData.js";
import type * as recipeCards from "../recipeCards.js";
import type * as recipeImages from "../recipeImages.js";
import type * as recipeImagesData from "../recipeImagesData.js";
import type * as recipeIngestion from "../recipeIngestion.js";
import type * as recipeSearch from "../recipeSearch.js";
import type * as recipeWebScrape from "../recipeWebScrape.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiSettings: typeof aiSettings;
  auth: typeof auth;
  crons: typeof crons;
  email: typeof email;
  groceryLists: typeof groceryLists;
  http: typeof http;
  "lib/agentmail": typeof lib_agentmail;
  "lib/aiErrorCodes": typeof lib_aiErrorCodes;
  "lib/aiErrors": typeof lib_aiErrors;
  "lib/aiKeyCrypto": typeof lib_aiKeyCrypto;
  "lib/aiModel": typeof lib_aiModel;
  "lib/aiProviderCheck": typeof lib_aiProviderCheck;
  "lib/aiValidators": typeof lib_aiValidators;
  "lib/boundedFetch": typeof lib_boundedFetch;
  "lib/groceryCategory": typeof lib_groceryCategory;
  "lib/groceryMerge": typeof lib_groceryMerge;
  "lib/manualIngredient": typeof lib_manualIngredient;
  "lib/nutrition": typeof lib_nutrition;
  "lib/planGrocery": typeof lib_planGrocery;
  "lib/plannerCopy": typeof lib_plannerCopy;
  "lib/plannerRules": typeof lib_plannerRules;
  "lib/plannerSlots": typeof lib_plannerSlots;
  "lib/plannerValidators": typeof lib_plannerValidators;
  "lib/publicDns": typeof lib_publicDns;
  "lib/recipeAgentTypes": typeof lib_recipeAgentTypes;
  "lib/recipeJsonLd": typeof lib_recipeJsonLd;
  "lib/recipePromptSource": typeof lib_recipePromptSource;
  "lib/recipeScrape": typeof lib_recipeScrape;
  "lib/recipeSearch": typeof lib_recipeSearch;
  "lib/slotHistory": typeof lib_slotHistory;
  "lib/urls": typeof lib_urls;
  "lib/userModelConfig": typeof lib_userModelConfig;
  "lib/userRecipes": typeof lib_userRecipes;
  planner: typeof planner;
  plannerCopy: typeof plannerCopy;
  plannerGrocery: typeof plannerGrocery;
  plannerHistory: typeof plannerHistory;
  recipeAgent: typeof recipeAgent;
  recipeAgentData: typeof recipeAgentData;
  recipeCards: typeof recipeCards;
  recipeImages: typeof recipeImages;
  recipeImagesData: typeof recipeImagesData;
  recipeIngestion: typeof recipeIngestion;
  recipeSearch: typeof recipeSearch;
  recipeWebScrape: typeof recipeWebScrape;
  recipes: typeof recipes;
  seed: typeof seed;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authEmail: import("@convex-dev/auth/components/email/_generated/component.js").ComponentApi<"authEmail">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
