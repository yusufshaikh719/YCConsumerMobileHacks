import type { LatLng, Sidequest } from "../services/types";
import { distanceMeters, stepToward } from "./geo";

export const SIMULATED_WALK_MS = 150_000;

export function simulatedPosition(quest: Sidequest, now: number): LatLng {
  const progress = Math.max(0, Math.min(1, (now - quest.revealAt) / SIMULATED_WALK_MS));
  return stepToward(quest.origin, quest.landmark.coords, distanceMeters(quest.origin, quest.landmark.coords) * progress);
}
