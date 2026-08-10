/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as lib_contentGeneration from "../lib/contentGeneration.js";
import type * as lib_serviceKey from "../lib/serviceKey.js";
import type * as publicBrowse from "../publicBrowse.js";
import type * as publicEntries from "../publicEntries.js";
import type * as rateLimit from "../rateLimit.js";
import type * as search from "../search.js";
import type * as sitemap from "../sitemap.js";
import type * as sources from "../sources.js";
import type * as sync from "../sync.js";
import type * as tags from "../tags.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "lib/contentGeneration": typeof lib_contentGeneration;
  "lib/serviceKey": typeof lib_serviceKey;
  publicBrowse: typeof publicBrowse;
  publicEntries: typeof publicEntries;
  rateLimit: typeof rateLimit;
  search: typeof search;
  sitemap: typeof sitemap;
  sources: typeof sources;
  sync: typeof sync;
  tags: typeof tags;
  views: typeof views;
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
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
