import type { Fix, Landmark } from "../services/types";
import { distanceMeters } from "./geo";

export function insideGeofence(position: Fix, landmark: Landmark, slack = 1) {
  return distanceMeters(position, landmark.coords) <= landmark.radiusMeters * slack;
}

export function arrivedAt(position: Fix, landmark: Landmark) {
  const tolerance = Math.min(30, Math.max(0, position.accuracy ?? 0));
  return distanceMeters(position, landmark.coords) <= landmark.radiusMeters + tolerance;
}
