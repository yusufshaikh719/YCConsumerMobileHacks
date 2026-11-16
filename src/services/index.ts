import { createLocalService } from "./localService";
import { deviceStorage } from "./storage";

export const ante = createLocalService({ storage: deviceStorage() });
export type { AnteService } from "./types";
