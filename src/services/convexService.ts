import type { ConvexReactClient } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { distanceMeters } from "../lib/geo";
import { PING_LEAD_MS, pickPingTime } from "../lib/time";
import { DEFAULT_WINDOWS, parseInviteCode, sortWindows, validWindows } from "../lib/windows";
import { discoverLandmark, walkMinutesFor } from "./discovery";
import { completionMinutes, initials, ME_ID, STAKE_CENTS, weekBounds } from "./localService";
import { rankStandings } from "./standings";
import { buildCheckoutUrl } from "./whop";
import type { Storage } from "./storage";
import { NoLandmarkError, REACTIONS, type AnteService, type AnteSnapshot, type FreeWindow, type Funding, type Landmark, type LatLng, type Member, type Postcard, type Reaction, type Sidequest } from "./types";

export type Backend = Pick<ConvexReactClient, "query" | "mutation" | "action" | "watchQuery">;
type Group = NonNullable<FunctionReturnType<typeof api.ante.getGroup>>;

type Saved = {
  deviceId: string;
  userId: string | null;
  name: string;
  potId: string | null;
  windows: FreeWindow[];
  onboarded: boolean;
};

type Deps = {
  client: Backend;
  storage: Storage;
  discover?: (origin: LatLng) => Promise<Landmark | null>;
  clock?: () => number;
  upload?: (uploadUrl: string, photoUri: string) => Promise<string>;
  timezone?: () => string;
  newDeviceId?: () => string;
};

const TINTS = ["#2FA052", "#D9653B", "#3B6FD9", "#B8478F", "#C9A227", "#4AA3A3"];

export const randomDeviceId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

export async function uploadPhoto(uploadUrl: string, photoUri: string) {
  const blob = await (await fetch(photoUri)).blob();
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
  if (!response.ok) throw new Error(`Photo upload failed: ${response.status}`);
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}

export const availabilitySlots = (windows: FreeWindow[]) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => windows.map(w => ({ dayOfWeek, startMinute: w.startMinute, endMinute: Math.min(1439, w.endMinute) }))).flat();

function toPostcard(stamp: Group["stamps"][number]): Postcard {
  const reactions = Object.fromEntries(REACTIONS.map(r => [r, stamp.reactions.filter(x => x.reaction === r).map(x => x.userId as string)])) as Record<Reaction, string[]>;
  const { lat, lng, thumbnailUrl, ...landmark } = stamp.landmark;
  return {
    id: stamp.id,
    memberId: stamp.userId,
    landmark: { ...landmark, coords: { lat, lng }, thumbnail: thumbnailUrl ? { uri: thumbnailUrl } : null },
    photo: stamp.photoUrl ? { uri: stamp.photoUrl } : null,
    completedAt: stamp.completedAt,
    minutesTaken: stamp.minutesTaken,
    reactions,
    verifiedBy: stamp.verifiedBy,
  };
}

function funding(group: Group | null): Funding {
  if (!group) return { payments: "unavailable", myStake: null, paidCount: 0, lastPayout: null };
  const last = group.lastSettlement;
  const transfers = last?.transfers ?? [];
  return {
    payments: group.payments,
    myStake: group.members.find(m => m.userId === group.meId)?.stakeStatus === "funded" ? "paid" : "unpaid",
    paidCount: group.members.filter(m => m.stakeStatus === "funded").length,
    lastPayout: last ? {
      winners: last.winners,
      amountCents: last.perWinnerCents,
      transfer: transfers.some(t => t.status === "pending") ? "pending" : transfers.length && transfers.every(t => t.status === "completed" && t.mode === "live") ? "whop" : "fallback",
      at: last.at,
    } : null,
  };
}

export function createConvexService({
  client,
  storage,
  discover = origin => discoverLandmark(origin),
  clock = Date.now,
  upload = uploadPhoto,
  timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  newDeviceId = randomDeviceId,
}: Deps): AnteService {
  const listeners = new Set<() => void>();
  let saved: Saved = { deviceId: "", userId: null, name: "", potId: null, windows: DEFAULT_WINDOWS, onboarded: false };
  let group: Group | null = null;
  let unwatch: (() => void) | null = null;
  let loaded = false;
  let nextPingAt: number | null = null;

  const member = (id: string, fullName: string, index: number, mine: boolean): Member => ({
    id,
    name: mine ? "You" : fullName.split(/\s+/)[0] || "Player",
    fullName,
    initials: initials(fullName),
    tint: TINTS[index % TINTS.length],
  });

  const build = (): AnteSnapshot => {
    const now = clock();
    const meId = group?.meId ?? ME_ID;
    const members = group ? group.members.map((m, i) => member(m.userId, m.name, i, m.userId === meId)) : [member(ME_ID, saved.name.trim() || "You", 0, true)];
    const postcards = (group?.stamps ?? []).map(toPostcard).sort((a, b) => b.completedAt - a.completedAt);
    return {
      meId,
      backend: "convex",
      funding: funding(group),
      loaded,
      onboarded: saved.onboarded,
      group: { name: group?.title ?? "Your group", inviteCode: group?.inviteCode ?? "", members, joined: group ? group.createdBy !== group.meId : false },
      stakeCents: group?.stakeCents ?? STAKE_CENTS,
      potCents: group?.potCents ?? 0,
      weekEndsAt: group?.weekEndsAt ?? weekBounds(now).endsAt,
      windows: saved.windows,
      postcards,
      standings: rankStandings(members, postcards),
      nextPingAt,
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

  const watch = () => {
    unwatch?.();
    unwatch = null;
    group = null;
    if (!saved.potId) return;
    const watcher = client.watchQuery(api.ante.getGroup, { deviceId: saved.deviceId, potId: saved.potId as Id<"pots"> });
    const update = () => {
      try {
        const result = watcher.localQueryResult();
        if (result !== undefined) group = result;
      } catch {
        group = null;
      }
      emit();
    };
    unwatch = watcher.onUpdate(update);
    update();
  };

  const identify = async () => {
    const userId = await client.mutation(api.ante.ensureUser, { deviceId: saved.deviceId, name: saved.name.trim() || "Player" });
    saved = { ...saved, userId };
    return userId;
  };

  const syncWindows = async () => {
    if (!saved.potId || !saved.userId) return;
    await client
      .mutation(api.availability.setAvailabilityWindows, { potId: saved.potId as Id<"pots">, userId: saved.userId as Id<"users">, timezone: timezone(), slots: availabilitySlots(saved.windows) })
      .catch(() => undefined);
  };

  const register = async ({ landmark, origin, pingAt, revealAt, expiresAt }: Sidequest) => {
    const thumbnail = landmark.thumbnail && typeof landmark.thumbnail === "object" && "uri" in landmark.thumbnail ? landmark.thumbnail.uri : undefined;
    return await client.mutation(api.ante.startQuest, {
      deviceId: saved.deviceId,
      potId: saved.potId as Id<"pots">,
      landmark: {
        id: landmark.id, name: landmark.name, neighborhood: landmark.neighborhood, lat: landmark.coords.lat, lng: landmark.coords.lng,
        trivia: landmark.trivia, source: landmark.source, radiusMeters: landmark.radiusMeters,
        ...(thumbnail ? { thumbnailUrl: thumbnail } : {}), ...(landmark.url ? { url: landmark.url } : {}),
      },
      originLat: origin.lat,
      originLng: origin.lng,
      pingAt,
      revealAt,
      expiresAt,
    });
  };

  const enterGroup = async (potId: string) => {
    saved = { ...saved, potId };
    watch();
    await persist();
    await syncWindows();
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
      if (!saved.deviceId) {
        saved = { ...saved, deviceId: newDeviceId() };
        await storage.write(JSON.stringify(saved));
      }
      loaded = true;
      watch();
      emit();
    },
    async setName(name) {
      saved = { ...saved, name: name.trim().slice(0, 40) };
      await persist();
      if (saved.userId) await identify().catch(() => undefined);
    },
    async setWindows(windows) {
      if (!validWindows(windows)) throw new Error("Windows must not overlap");
      saved = { ...saved, windows: sortWindows(windows) };
      nextPingAt = null;
      await persist();
      await syncWindows();
    },
    async createGroup(name) {
      await identify();
      const created = await client.mutation(api.ante.createGroup, { deviceId: saved.deviceId, name, weekEndsAt: weekBounds(clock()).endsAt });
      await enterGroup(created.potId);
    },
    async joinGroup(input) {
      const code = parseInviteCode(input);
      if (!code) return "invalid";
      await identify();
      const joined = await client.mutation(api.ante.joinGroup, { deviceId: saved.deviceId, inviteCode: code });
      if (!joined) return "not_found";
      await enterGroup(joined.potId);
      return "joined";
    },
    async finishOnboarding() {
      saved = { ...saved, onboarded: true };
      await persist();
    },
    async armNextPing(at) {
      nextPingAt = pickPingTime(saved.windows, at);
      emit();
      return nextPingAt;
    },
    async startSidequest(pingAt, origin) {
      if (nextPingAt === pingAt) {
        nextPingAt = null;
        emit();
      }
      if (!saved.potId) throw new Error("Join a group first");
      const landmark = await discover(origin);
      if (!landmark) throw new NoLandmarkError();
      const distance = distanceMeters(origin, landmark.coords);
      const walkMinutes = walkMinutesFor(distance);
      const revealAt = pingAt + PING_LEAD_MS;
      const expiresAt = revealAt + completionMinutes(walkMinutes) * 60_000;
      const quest = { id: "", landmark, origin, pingAt, revealAt, expiresAt, distanceMeters: distance, walkMinutes };
      return { ...quest, id: await register(quest) };
    },
    async verifyArrival(quest, photoUri, position) {
      const before = snapshot.standings;
      let photoStorageId: string | undefined;
      if (photoUri) {
        try {
          photoStorageId = await upload(await client.mutation(api.submissions.generateUploadUrl, {}), photoUri);
        } catch {
          photoStorageId = undefined;
        }
      }
      try {
        const sidequestId = quest.id.startsWith("sq-") ? await register(quest) : quest.id;
        const result = await client.action(api.ante.submitArrival, {
          deviceId: saved.deviceId,
          sidequestId: sidequestId as Id<"sidequests">,
          lat: position.lat,
          lng: position.lng,
          ...(position.accuracy != null ? { accuracy: position.accuracy } : {}),
          ...(photoStorageId ? { photoStorageId: photoStorageId as Id<"_storage"> } : {}),
        });
        if (!result.ok) return { ok: false, reason: "not_verified" };
        const fresh = await client.query(api.ante.getGroup, { deviceId: saved.deviceId, potId: saved.potId as Id<"pots"> });
        if (fresh) group = fresh;
        emit();
        const postcard = snapshot.postcards.find(p => p.id === result.stampId);
        if (!postcard) return { ok: false, reason: "not_verified" };
        return { ok: true, postcard, before, after: snapshot.standings };
      } catch {
        return { ok: false, reason: "not_verified" };
      }
    },
    async react(postcardId, reaction) {
      await client.mutation(api.ante.react, { deviceId: saved.deviceId, stampId: postcardId as Id<"stamps">, reaction });
    },
    async buyIn() {
      const userId = saved.userId ?? group?.meId;
      if (!saved.potId || !userId) return { url: null, mode: "fallback" };
      const checkout = await client.action(api.whop.createPotCheckout, { potId: saved.potId as Id<"pots">, userId: userId as Id<"users"> });
      const url = buildCheckoutUrl(checkout.checkoutUrl);
      return { url, mode: url ? checkout.mode : "fallback" };
    },
  };
}
