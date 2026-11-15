import { TurboModuleRegistry } from "react-native";

type Maps = typeof import("react-native-maps");

let cached: Maps | null | undefined;

export function loadMaps(): Maps | null {
  if (cached !== undefined) return cached;
  try {
    cached = TurboModuleRegistry.get("RNMapsAirModule") ? (require("react-native-maps") as Maps) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export const walkingDirectionsUrl = ({ lat, lng }: { lat: number; lng: number }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
