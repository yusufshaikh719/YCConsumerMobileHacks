import { distanceMeters } from "../lib/geo";
import { insideGeofence } from "../lib/geofence";
import { DAY, PING_LEAD_MS, pickPingTime } from "../lib/time";
import { DEFAULT_WINDOWS, parseInviteCode, sortWindows, validWindows } from "../lib/windows";
import { discoverLandmark, walkMinutesFor } from "./discovery";
import { rankStandings } from "./standings";
import type { Storage } from "./storage";
import { NoLandmarkError, type AnteService, type AnteSnapshot, type FreeWindow, type Landmark, type LatLng, type Member, type Postcard, type Reaction, type Sidequest } from "./types";

export const ME_ID = "me";
export const STAKE_CENTS = 2000;

type Saved = {
  name: string;
  windows: FreeWindow[];
  group: { name: string; inviteCode: string; joined: boolean };
  onboarded: boolean;
  nextPingAt?: number | null;
  postcards: (Omit<Postcard, "photo"> & { photoUri: string | null })[];
};

type Deps = {
  storage: Storage;
  discover?: (origin: LatLng) => Promise<Landmark | null>;
  clock?: () => number;
};

const emptyReactions = (): Record<Reaction, string[]> => ({ "🔥": [], "👏": [], "😂": [], "🫡": [] });

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "ME";

export function weekBounds(now: number) {
  const end = new Date(now);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  end.setHours(21, 0, 0, 0);
  if (end.getTime() <= now) end.setDate(end.getDate() + 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { startsAt: start.getTime(), endsAt: end.getTime() };
}

export const completionMinutes = (walkMinutes: number) => Math.min(35, Math.max(20, walkMinutes * 2 + 5));

export function createLocalService({ storage, discover = origin => discoverLandmark(origin), clock = Date.now }: Deps): AnteService {
  const listeners = new Set<() => void>();
  const newCode = () => Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  let saved: Saved = { name: "", windows: DEFAULT_WINDOWS, group: { name: "", inviteCode: newCode(), joined: false }, onboarded: false, postcards: [] };
  let loaded = false;

  const me = (): Member => {
    const name = saved.name.trim() || "You";
    return { id: ME_ID, name: "You", fullName: name, initials: initials(saved.name.trim() || "Me"), tint: "#2FA052" };
  };

  const build = (): AnteSnapshot => {
    const now = clock();
    const { startsAt, endsAt } = weekBounds(now);
    const members = [me()];
    const postcards = saved.postcards
      .filter(p => p.completedAt > startsAt && p.completedAt <= endsAt)
      .sort((a, b) => b.completedAt - a.completedAt)
      .map(({ photoUri, ...p }) => ({ ...p, photo: photoUri ? { uri: photoUri } : null }));
    return {
      meId: ME_ID,
      backend: "local",
      funding: { payments: "unavailable", myStake: null, paidCount: 0, lastPayout: null },
      loaded,
      onboarded: saved.onboarded,
      group: {
        name: saved.group.name || (saved.name.trim() ? `${saved.name.trim().split(/\s+/)[0]}'s group` : "Your group"),
        inviteCode: saved.group.inviteCode,
        members,
        joined: saved.group.joined,
      },
      stakeCents: STAKE_CENTS,
      potCents: STAKE_CENTS * members.length,
      weekEndsAt: endsAt,
      windows: saved.windows,
      postcards,
      standings: rankStandings(members, postcards),
      nextPingAt: saved.nextPingAt ?? null,
    };
  };

  let snapshot = build();
  const emit = () => {
    snapshot = build();
    listeners.forEach(listener => listener());
  };
  const persist = async () => {
    emit();
    await storage.write(JSON.stringify(saved));
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      const text = await storage.read().catch(() => null);
      if (text) {
        try {
          const parsed = JSON.parse(text) as Partial<Saved>;
          saved = { ...saved, ...parsed, windows: parsed.windows && validWindows(parsed.windows) ? sortWindows(parsed.windows) : saved.windows };
        } catch {
          saved = { ...saved };
        }
      }
      loaded = true;
      emit();
    },
    async setName(name) {
      saved = { ...saved, name: name.trim().slice(0, 40) };
      await persist();
    },
    async setWindows(windows) {
      if (!validWindows(windows)) throw new Error("Windows must not overlap");
      saved = { ...saved, windows: sortWindows(windows), nextPingAt: null };
      await persist();
    },
    async createGroup(name) {
      saved = { ...saved, group: { name: name.trim().slice(0, 40), inviteCode: saved.group.joined ? newCode() : saved.group.inviteCode, joined: false } };
      await persist();
    },
    async joinGroup(input) {
      const code = parseInviteCode(input);
      if (!code) return "invalid";
      return code === saved.group.inviteCode ? "joined" : "offline";
    },
    async finishOnboarding() {
      saved = { ...saved, onboarded: true };
      await persist();
    },
    async armNextPing(at, pingAt) {
      const nextPingAt = pingAt ?? pickPingTime(saved.windows, at);
      saved = { ...saved, nextPingAt };
      await persist();
      return nextPingAt;
    },
    async startSidequest(pingAt, origin) {
      const landmark = await discover(origin);
      if (!landmark) throw new NoLandmarkError();
      const distance = distanceMeters(origin, landmark.coords);
      const walkMinutes = walkMinutesFor(distance);
      const revealAt = pingAt + PING_LEAD_MS;
      return {
        id: `sq-${pingAt}`,
        landmark,
        origin,
        pingAt,
        revealAt,
        expiresAt: revealAt + completionMinutes(walkMinutes) * 60_000,
        distanceMeters: distance,
        walkMinutes,
      };
    },
    async verifyArrival(quest, photoUri, position) {
      const slack = 1 + Math.min(1, (position.accuracy ?? 0) / quest.landmark.radiusMeters);
      if (!insideGeofence(position, quest.landmark, Math.max(1.5, slack))) return { ok: false, reason: "not_verified" };
      const before = snapshot.standings;
      const id = `pc-${quest.id}`;
      const completedAt = Math.min(clock(), quest.expiresAt);
      const kept = photoUri ? await storage.keepPhoto(photoUri, id).catch(() => photoUri) : null;
      const entry = {
        id,
        memberId: ME_ID,
        landmark: quest.landmark,
        photoUri: kept,
        completedAt,
        minutesTaken: Math.max(1, Math.round((completedAt - quest.revealAt) / 60_000)),
        reactions: emptyReactions(),
      };
      saved = { ...saved, postcards: [entry, ...saved.postcards.filter(p => p.id !== id)] };
      await persist();
      const postcard = snapshot.postcards.find(p => p.id === id)!;
      return { ok: true, postcard, before, after: snapshot.standings };
    },
    async react(postcardId, reaction) {
      saved = {
        ...saved,
        postcards: saved.postcards.map(p => {
          if (p.id !== postcardId) return p;
          const who = p.reactions[reaction];
          return { ...p, reactions: { ...p.reactions, [reaction]: who.includes(ME_ID) ? who.filter(x => x !== ME_ID) : [...who, ME_ID] } };
        }),
      };
      await persist();
    },
    async buyIn() {
      return { url: null, mode: "fallback" };
    },
  };
}
