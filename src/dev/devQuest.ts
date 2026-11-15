import { distanceMeters } from "../lib/geo";
import { PING_LEAD_MS } from "../lib/time";
import { walkMinutesFor } from "../services/discovery";
import { completionMinutes } from "../services/localService";
import type { Landmark, Sidequest } from "../services/types";

export const YC_HQ: Landmark = {
  id: "dev-yc-hq",
  name: "Y Combinator",
  neighborhood: "Dogpatch",
  coords: { lat: 37.76071, lng: -122.38602 },
  thumbnail: null,
  trivia: "The startup accelerator works out of the 1880s Union Iron Works office at 560 20th Street, where the shipyard once drew up its warships.",
  source: "OpenStreetMap",
  url: "https://www.openstreetmap.org/way/257338714",
  radiusMeters: 50,
};

const DEV_ORIGIN = { lat: 37.7569, lng: -122.3929 };

export function devQuest(pingAt: number): Sidequest {
  const distance = distanceMeters(DEV_ORIGIN, YC_HQ.coords);
  const walkMinutes = walkMinutesFor(distance);
  const revealAt = pingAt + PING_LEAD_MS;
  return { id: `sq-dev-${pingAt}`, landmark: YC_HQ, origin: DEV_ORIGIN, pingAt, revealAt, expiresAt: revealAt + completionMinutes(walkMinutes) * 60_000, distanceMeters: distance, walkMinutes };
}

