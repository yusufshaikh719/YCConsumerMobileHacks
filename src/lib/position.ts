import type * as LocationModule from "expo-location";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { Fix } from "../services/types";
import { optionalNative } from "./native";

const loadLocation = optionalNative(["ExpoLocation"], () => require("expo-location") as typeof LocationModule);

export const locationAvailable = () => loadLocation() !== null;

const toFix = (loc: LocationModule.LocationObject): Fix => ({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy });

export async function getCurrentFix(): Promise<{ fix: Fix } | { denied: true } | { unavailable: true }> {
  const Location = loadLocation();
  if (Platform.OS === "web" || !Location) return { unavailable: true };
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return { denied: true };
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
    ]);
    const loc = current ?? (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }));
    return loc ? { fix: toFix(loc) } : { unavailable: true };
  } catch {
    return { unavailable: true };
  }
}

export function useDevicePosition(active: boolean) {
  const [position, setPosition] = useState<Fix | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    const Location = loadLocation();
    if (!active || Platform.OS === "web" || !Location) return;
    let sub: LocationModule.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setDenied(true);
      const next = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000 }, loc => setPosition(toFix(loc)));
      if (cancelled) next.remove();
      else sub = next;
    })().catch(() => setDenied(true));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
  return { position, denied };
}

export function useHeading(active: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    const Location = loadLocation();
    if (!active || Platform.OS === "web" || !Location) return;
    let sub: LocationModule.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;
      const next = await Location.watchHeadingAsync(h => {
        const value = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (Number.isFinite(value)) setHeading(value);
      });
      if (cancelled) next.remove();
      else sub = next;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
  return heading;
}
