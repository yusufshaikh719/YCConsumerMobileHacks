import { ConvexReactClient } from "convex/react";
import { createConvexService } from "./convexService";
import { createLocalService } from "./localService";
import { deviceStorage } from "./storage";
import type { AnteService } from "./types";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

export const convexClient = convexUrl ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }) : null;
export const ante: AnteService = convexClient
  ? createConvexService({ client: convexClient, storage: deviceStorage("ante-convex.json") })
  : createLocalService({ storage: deviceStorage() });
export type { AnteService } from "./types";
