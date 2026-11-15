import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { devToolsEnabled } from "../dev/enabled";
import { distanceMeters } from "../lib/geo";
import { cancelPing, enableNotifications, onPingNotification, schedulePing } from "../lib/notifications";
import { simulatedPosition, useDevicePosition, useHeading } from "../lib/position";
import { PING_LEAD_MS } from "../lib/time";
import { useNow } from "../lib/useNow";
import { ante } from "../services";
import type { AnteSnapshot, LatLng } from "../services/types";
import { initialPhase, reduce, type Event, type Phase, type PhaseName } from "./machine";

type Ante = {
  phase: Phase;
  data: AnteSnapshot;
  position: LatLng | null;
  heading: number | null;
  locationDenied: boolean;
  dispatch: (event: Event) => void;
  jump: (target: DevTarget) => Promise<void>;
};

export type DevTarget = PhaseName | "waiting-open" | "waiting-closed" | "not-verified" | "ping-notification";

const AnteContext = createContext<Ante | null>(null);
const QUEST_PHASES: PhaseName[] = ["live", "arrived", "verifying"];

export function AnteProvider({ children }: { children: ReactNode }) {
  const data = useSyncExternalStore(ante.subscribe, ante.getSnapshot);
  const [phase, dispatch] = useReducer(reduce, initialPhase);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const scheduledFor = useRef<number | null>(null);

  const questActive = QUEST_PHASES.includes(phase.name);
  const tracking = questActive && ante.positionMode === "device";
  const device = useDevicePosition(tracking);
  const heading = useHeading(phase.name === "live");
  const now = useNow(questActive ? 1000 : 60_000);
  const quest = "quest" in phase ? phase.quest : null;
  const position = !quest ? null : ante.positionMode === "device" ? device.position : phase.name === "live" ? simulatedPosition(quest, now) : quest.landmark.coords;

  const firePing = useCallback(async (pingAt: number) => {
    if (phaseRef.current.name !== "waiting") return;
    const quest = await ante.startSidequest(pingAt);
    scheduledFor.current = null;
    dispatch({ type: "PING", quest, now: Date.now() });
  }, []);

  useEffect(() => onPingNotification(pingAt => void firePing(pingAt)), [firePing]);

  useEffect(() => {
    if (phase.name !== "waiting") return;
    const pingAt = data.nextPingAt;
    if (!pingAt || pingAt + PING_LEAD_MS <= Date.now()) {
      void ante.armNextPing(Date.now());
      return;
    }
    if (scheduledFor.current !== pingAt) {
      scheduledFor.current = pingAt;
      void enableNotifications().then(ok => (ok ? schedulePing(pingAt) : undefined)).catch(() => undefined);
    }
    const fire = () => {
      if (Date.now() >= pingAt) void firePing(pingAt);
    };
    const timer = setTimeout(fire, Math.max(0, pingAt - Date.now()));
    const sub = AppState.addEventListener("change", state => state === "active" && fire());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [phase.name, data.nextPingAt, firePing]);

  useEffect(() => {
    if (phase.name === "waiting") return;
    if (router.canDismiss()) router.dismissAll();
  }, [phase.name]);

  useEffect(() => {
    if (phase.name !== "ping") return;
    const timer = setTimeout(() => dispatch({ type: "REVEAL" }), Math.max(0, phase.quest.revealAt - Date.now()));
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase.name !== "live" && phase.name !== "arrived") return;
    const timer = setTimeout(() => dispatch({ type: "TIMEOUT" }), Math.max(0, phase.quest.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase.name !== "live" || !position) return;
    if (distanceMeters(position, phase.quest.landmark.coords) <= phase.quest.landmark.radiusMeters) dispatch({ type: "ARRIVE" });
  }, [phase, position]);

  const positionRef = useRef(position);
  positionRef.current = position;
  useEffect(() => {
    if (phase.name !== "verifying") return;
    let cancelled = false;
    void ante.verifyArrival(phase.quest, phase.photoUri, positionRef.current ?? phase.quest.landmark.coords).then(result => {
      if (!cancelled) dispatch(result.ok ? { type: "VERIFIED", result } : { type: "REJECTED" });
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const jump = useCallback(async (target: DevTarget) => {
    const at = Date.now();
    if (target === "waiting" || target === "waiting-open" || target === "waiting-closed") {
      dispatch({ type: "DEV_JUMP", phase: { name: "waiting", preview: target === "waiting" ? undefined : target === "waiting-open" ? "open" : "closed" } });
      return;
    }
    if (target === "ping-notification") {
      dispatch({ type: "DEV_JUMP", phase: { name: "waiting" } });
      const pingAt = at + 10_000;
      scheduledFor.current = pingAt;
      await cancelPing();
      if (await enableNotifications()) await schedulePing(pingAt);
      setTimeout(() => void firePing(pingAt), 10_000);
      return;
    }
    const elapsed = target === "ping" ? 0 : target === "live" ? PING_LEAD_MS + 20_000 : PING_LEAD_MS + 11 * 60_000;
    const quest = await ante.startSidequest(at - elapsed);
    if (target === "ping" || target === "live" || target === "arrived") dispatch({ type: "DEV_JUMP", phase: { name: target, quest } });
    else if (target === "verifying") dispatch({ type: "DEV_JUMP", phase: { name: "verifying", quest, photoUri: null } });
    else if (target === "failed") dispatch({ type: "DEV_JUMP", phase: { name: "failed", quest: { ...quest, expiresAt: at }, reason: "timeout" } });
    else if (target === "not-verified") dispatch({ type: "DEV_JUMP", phase: { name: "failed", quest, reason: "not_verified" } });
    else if (target === "verified") {
      const result = await ante.verifyArrival(quest, null, quest.landmark.coords);
      if (result.ok) dispatch({ type: "DEV_JUMP", phase: { name: "verified", quest, result } });
    }
  }, [firePing]);

  useEffect(() => {
    if (Platform.OS !== "web" || !devToolsEnabled) return;
    const target = new URLSearchParams(globalThis.location?.search ?? "").get("state");
    if (target) void jump(target as DevTarget);
  }, [jump]);

  return (
    <AnteContext.Provider value={{ phase, data, position, heading, locationDenied: device.denied, dispatch, jump }}>
      {children}
    </AnteContext.Provider>
  );
}

export function useAnte() {
  const value = useContext(AnteContext);
  if (!value) throw new Error("useAnte must be used inside AnteProvider");
  return value;
}
