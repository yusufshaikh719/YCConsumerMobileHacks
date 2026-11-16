/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ante from "../ante.js";
import type * as availability from "../availability.js";
import type * as challenges from "../challenges.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as http from "../http.js";
import type * as lib_contracts from "../lib/contracts.js";
import type * as mapReferee from "../mapReferee.js";
import type * as personas from "../personas.js";
import type * as pots from "../pots.js";
import type * as premium from "../premium.js";
import type * as referee from "../referee.js";
import type * as settlement from "../settlement.js";
import type * as sidequests from "../sidequests.js";
import type * as submissions from "../submissions.js";
import type * as whop from "../whop.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ante: typeof ante;
  availability: typeof availability;
  challenges: typeof challenges;
  crons: typeof crons;
  demo: typeof demo;
  http: typeof http;
  "lib/contracts": typeof lib_contracts;
  mapReferee: typeof mapReferee;
  personas: typeof personas;
  pots: typeof pots;
  premium: typeof premium;
  referee: typeof referee;
  settlement: typeof settlement;
  sidequests: typeof sidequests;
  submissions: typeof submissions;
  whop: typeof whop;
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

export declare const components: {};
