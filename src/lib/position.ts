import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { Fix } from "../services/types";

const toFix = (loc: Location.LocationObject): Fix => ({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy });

export async function getCurrentFix(): Promise<{ fix: Fix } | { denied: true } | { unavailable: true }> {
  if (Platform.OS === "web") return { unavailable: true };
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
    if (!active || Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
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
    if (!active || Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
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
