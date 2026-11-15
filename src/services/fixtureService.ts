import { distanceMeters } from "../lib/geo";
import { PING_LEAD_MS, pickPingTime } from "../lib/time";
import { ME_ID, STAKE_CENTS, group, myQuestPhoto, seedPostcards, todaysQuest, weekEndsAt } from "./fixtures";
import { rankStandings } from "./standings";
import type { AnteService, AnteSnapshot, FreeWindow, Postcard, Sidequest } from "./types";

const VERIFY_DELAY_MS = 2600;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function createFixtureService(now = Date.now()): AnteService & { failNextVerification(): void } {
  const listeners = new Set<() => void>();
  let failNext = false;
  let postcards = seedPostcards(now);
  let window: FreeWindow = { startMinute: 15 * 60, endMinute: 18 * 60 };
  let nextPingAt: number | null = null;

  const build = (): AnteSnapshot => ({
    meId: ME_ID,
    group,
    stakeCents: STAKE_CENTS,
    potCents: STAKE_CENTS * group.members.length,
    weekEndsAt: weekEndsAt(now),
    window,
    postcards,
    standings: rankStandings(group.members, postcards),
    nextPingAt,
  });
  let snapshot = build();
  const emit = () => {
    snapshot = build();
    listeners.forEach(listener => listener());
  };

  return {
    positionMode: "simulated",
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async setWindow(next) {
      window = next;
      nextPingAt = null;
      emit();
    },
    async armNextPing(at) {
      nextPingAt = pickPingTime(window, at);
      emit();
      return nextPingAt;
    },
    async startSidequest(pingAt): Promise<Sidequest> {
      const revealAt = pingAt + PING_LEAD_MS;
      if (nextPingAt === pingAt) {
        nextPingAt = null;
        emit();
      }
      return {
        id: `sq-${pingAt}`,
        landmark: todaysQuest.landmark,
        origin: todaysQuest.origin,
        pingAt,
        revealAt,
        expiresAt: revealAt + todaysQuest.windowMinutes * 60_000,
        distanceMeters: distanceMeters(todaysQuest.origin, todaysQuest.landmark.coords),
        walkMinutes: todaysQuest.walkMinutes,
      };
    },
    async verifyArrival(quest, photoUri, position) {
      await wait(VERIFY_DELAY_MS);
      const inside = distanceMeters(position, quest.landmark.coords) <= quest.landmark.radiusMeters * 1.5;
      if (failNext || !inside) {
        failNext = false;
        return { ok: false, reason: "not_verified" };
      }
      const before = snapshot.standings;
      const completedAt = Math.min(Date.now(), quest.expiresAt);
      const postcard: Postcard = {
        id: `pc-${quest.id}`,
        memberId: ME_ID,
        landmark: quest.landmark,
        photo: photoUri ? { uri: photoUri } : myQuestPhoto,
        completedAt,
        minutesTaken: Math.max(1, Math.round((completedAt - quest.revealAt) / 60_000)),
        reactions: { "🔥": [], "👏": [], "😂": [], "🫡": [] },
      };
      postcards = [postcard, ...postcards.filter(p => p.id !== postcard.id)];
      emit();
      return { ok: true, postcard, before, after: snapshot.standings };
    },
    async react(postcardId, reaction) {
      postcards = postcards.map(p => {
        if (p.id !== postcardId) return p;
        const who = p.reactions[reaction];
        return { ...p, reactions: { ...p.reactions, [reaction]: who.includes(ME_ID) ? who.filter(id => id !== ME_ID) : [...who, ME_ID] } };
      });
      emit();
    },
    failNextVerification() {
      failNext = true;
    },
  };
}
