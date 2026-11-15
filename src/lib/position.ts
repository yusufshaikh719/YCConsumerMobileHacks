import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { LatLng, Sidequest } from "../services/types";
import { stepToward, distanceMeters } from "./geo";

export const SIMULATED_WALK_MS = 150_000;

export function simulatedPosition(quest: Sidequest, now: number): LatLng {
  const progress = Math.max(0, Math.min(1, (now - quest.revealAt) / SIMULATED_WALK_MS));
  return stepToward(quest.origin, quest.landmark.coords, distanceMeters(quest.origin, quest.landmark.coords) * progress);
}

export function useDevicePosition(active: boolean) {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!active || Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setDenied(true);
      const next = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000 }, fix =>
        setPosition({ lat: fix.coords.latitude, lng: fix.coords.longitude }));
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
