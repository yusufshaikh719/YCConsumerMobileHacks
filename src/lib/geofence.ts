import type { LatLng, Landmark } from "../services/types";
import { distanceMeters } from "./geo";

export function insideGeofence(position: LatLng, landmark: Landmark, slack = 1) {
  return distanceMeters(position, landmark.coords) <= landmark.radiusMeters * slack;
}
