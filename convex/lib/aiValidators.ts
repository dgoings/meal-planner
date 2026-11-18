import { v } from "convex/values";
import { AI_ERROR_CODES } from "./aiErrorCodes";
import { AI_PROVIDERS } from "./aiModel";

export const aiProviderValidator = v.union(
  ...AI_PROVIDERS.map((provider) => v.literal(provider)),
);

export const aiErrorCodeValidator = v.union(
  ...AI_ERROR_CODES.map((code) => v.literal(code)),
);
