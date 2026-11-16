import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Linking, Platform } from "react-native";
import { devQuest } from "../dev/devQuest";
import { devToolsEnabled } from "../dev/enabled";
import { arrivedAt } from "../lib/geofence";
import { cancelPing, enableNotifications, notificationsGranted, onPingNotification, schedulePing } from "../lib/notifications";
import { getCurrentFix, useDevicePosition, useHeading } from "../lib/position";
import { PING_LEAD_MS } from "../lib/time";
import { ante } from "../services";
import type { AnteSnapshot, Fix, Sidequest } from "../services/types";
import { initialPhase, reduce, type Event, type Phase, type PhaseName } from "./machine";

type Ante = {
  phase: Phase;
  data: AnteSnapshot;
  position: Fix | null;
  heading: number | null;
  locationDenied: boolean;
  notificationsOn: boolean | null;
  retryNotifications: () => Promise<void>;
  dispatch: (event: Event) => void;
  jump: (target: DevTarget) => Promise<void>;
};

export type DevTarget = PhaseName | "waiting-open" | "waiting-closed" | "not-verified" | "ping-notification";

const AnteContext = createContext<Ante | null>(null);
const QUEST_PHASES: PhaseName[] = ["live", "arrived", "verifying"];

async function findQuest(pingAt: number): Promise<{ quest: Sidequest } | { reason: "no_landmark" | "no_location" }> {
  const located = await getCurrentFix();
  if (!("fix" in located)) return { reason: "no_location" };
  try {
    return { quest: await ante.startSidequest(pingAt, located.fix) };
  } catch {
    return { reason: "no_landmark" };
  }
}

export function AnteProvider({ children }: { children: ReactNode }) {
  const data = useSyncExternalStore(ante.subscribe, ante.getSnapshot);
  const [phase, dispatch] = useReducer(reduce, initialPhase);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const scheduledFor = useRef<number | null>(null);
  const [notificationsOn, setNotificationsOn] = useState<boolean | null>(null);

  const questActive = QUEST_PHASES.includes(phase.name);
  const device = useDevicePosition(questActive);
  const heading = useHeading(phase.name === "live");
  const position = questActive ? device.position : null;

  useEffect(() => {
    void ante.load();
  }, []);

  const firePing = useCallback(async (pingAt: number) => {
    if (phaseRef.current.name !== "waiting") return;
    scheduledFor.current = null;
    dispatch({ type: "PING", timing: { pingAt, revealAt: pingAt + PING_LEAD_MS }, now: Date.now() });
    const found = await findQuest(pingAt);
    dispatch("quest" in found ? { type: "QUEST_READY", quest: found.quest, now: Date.now() } : { type: "QUEST_UNAVAILABLE", reason: found.reason });
  }, []);

  useEffect(() => onPingNotification(pingAt => void firePing(pingAt)), [firePing]);

  useEffect(() => {
    if (phase.name !== "waiting" || !data.onboarded) return;
    const pingAt = data.nextPingAt;
    if (!pingAt || pingAt + PING_LEAD_MS <= Date.now()) {
      void ante.armNextPing(Date.now());
      return;
    }
    if (scheduledFor.current !== pingAt) {
      scheduledFor.current = pingAt;
      void enableNotifications()
        .then(ok => {
          setNotificationsOn(ok);
          return ok ? schedulePing(pingAt) : undefined;
        })
        .catch(() => undefined);
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
  }, [phase.name, data.onboarded, data.nextPingAt, firePing]);

  useEffect(() => {
    if (notificationsOn !== false) return;
    const sub = AppState.addEventListener("change", state => {
      if (state !== "active") return;
      void notificationsGranted().then(granted => {
        if (!granted) return;
        setNotificationsOn(true);
        if (data.nextPingAt) void schedulePing(data.nextPingAt).catch(() => undefined);
      });
    });
    return () => sub.remove();
  }, [notificationsOn, data.nextPingAt]);

  useEffect(() => {
    if (phase.name === "waiting") return;
    if (router.canDismiss()) router.dismissAll();
  }, [phase.name]);

  useEffect(() => {
    if (phase.name !== "ping" || !phase.quest) return;
    const timer = setTimeout(() => dispatch({ type: "REVEAL" }), Math.max(0, phase.timing.revealAt - Date.now()));
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase.name !== "live" && phase.name !== "arrived") return;
    const timer = setTimeout(() => dispatch({ type: "TIMEOUT" }), Math.max(0, phase.quest.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase.name !== "live" || !position) return;
    if (arrivedAt(position, phase.quest.landmark)) dispatch({ type: "ARRIVE" });
  }, [phase, position]);

  const positionRef = useRef(position);
  positionRef.current = position;
  useEffect(() => {
    if (phase.name !== "verifying") return;
    let cancelled = false;
    void (async () => {
      const located = positionRef.current ?? (await getCurrentFix().then(r => ("fix" in r ? r.fix : null)));
      const result = located ? await ante.verifyArrival(phase.quest, phase.photoUri, located) : ({ ok: false, reason: "not_verified" } as const);
      if (!cancelled) dispatch(result.ok ? { type: "VERIFIED", result } : { type: "REJECTED" });
    })();
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
    if (target === "ping") {
      dispatch({ type: "DEV_JUMP", phase: { name: "waiting" } });
      await firePing(at);
      return;
    }
    const elapsed = target === "live" ? PING_LEAD_MS + 20_000 : PING_LEAD_MS + 11 * 60_000;
    const quest = devQuest(at - elapsed);
    if (target === "live" || target === "arrived") dispatch({ type: "DEV_JUMP", phase: { name: target, quest } });
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

  const retryNotifications = useCallback(async () => {
    const ok = await enableNotifications();
    setNotificationsOn(ok);
    if (!ok) await Linking.openSettings().catch(() => undefined);
    else if (data.nextPingAt) await schedulePing(data.nextPingAt);
  }, [data.nextPingAt]);

  return (
    <AnteContext.Provider value={{ phase, data, position, heading, locationDenied: device.denied, notificationsOn, retryNotifications, dispatch, jump }}>
      {children}
    </AnteContext.Provider>
  );
}

export function useAnte() {
  const value = useContext(AnteContext);
  if (!value) throw new Error("useAnte must be used inside AnteProvider");
  return value;
}
