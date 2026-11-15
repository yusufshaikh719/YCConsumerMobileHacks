import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { findNextDispatchTime } from "./availability";

type Candidate = {
  destName: string;
  destLat: number;
  destLng: number;
  destSummary: string;
  destSource: "wikipedia" | "openstreetmap" | "curated_fallback";
  destUrl?: string;
  distanceMeters: number;
};

type Discovery = Candidate & {
  title: string;
  instruction: string;
  allottedMinutes: number;
  targetRadiusMeters: number;
  mode: "live" | "fallback";
};

export function haversineMeters(lat: number, lng: number, otherLat: number, otherLng: number): number {
  const radians = Math.PI / 180;
  const dLat = (otherLat - lat) * radians;
  const dLng = (otherLng - lng) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * radians) * Math.cos(otherLat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function walkingMinutes(distanceMeters: number): number {
  return Math.max(10, Math.min(30, Math.ceil(distanceMeters * 1.3 / 78) + 4));
}

function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) throw new Error("Discovery request failed");
        return await response.json();
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Discovery request timed out")); }, 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

function candidate(lat: number, lng: number, name: unknown, destLat: unknown, destLng: unknown, summary: unknown, source: Candidate["destSource"], url?: string): Candidate | null {
  if (typeof name !== "string" || !name.trim() || typeof destLat !== "number" || typeof destLng !== "number" || !validCoordinates(destLat, destLng)) return null;
  const distanceMeters = haversineMeters(lat, lng, destLat, destLng);
  if (distanceMeters < 450 || distanceMeters > 1450) return null;
  return { destName: name.trim(), destLat, destLng, destSummary: typeof summary === "string" && summary.trim() ? summary.trim() : `Explore ${name.trim()} and its surroundings.`, destSource: source, ...(url ? { destUrl: url } : {}), distanceMeters: Math.round(distanceMeters) };
}

async function wikipedia(lat: number, lng: number): Promise<Candidate[]> {
  const params = new URLSearchParams({ action: "query", list: "geosearch", gscoord: `${lat}|${lng}`, gsradius: "1600", gslimit: "50", format: "json", origin: "*" });
  const headers = { "User-Agent": "AnteApp/1.0 (https://github.com/yusufshaikh719/YCConsumerMobileHacks)" };
  const body = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`, { headers });
  const hits = Array.isArray(body?.query?.geosearch) ? body.query.geosearch : [];
  const ids = hits.map((hit: any) => hit.pageid).filter((id: unknown) => typeof id === "number");
  let pages: Record<string, any> = {};
  if (ids.length) {
    const extractParams = new URLSearchParams({ action: "query", prop: "extracts|description", exintro: "1", explaintext: "1", pageids: ids.join("|"), format: "json", origin: "*" });
    try {
      const extracts = await fetchJson(`https://en.wikipedia.org/w/api.php?${extractParams}`, { headers });
      pages = extracts?.query?.pages ?? {};
    } catch {
      pages = {};
    }
  }
  return hits.map((hit: any) => candidate(lat, lng, hit.title, hit.lat, hit.lon, pages[hit.pageid]?.extract || pages[hit.pageid]?.description, "wikipedia", typeof hit.pageid === "number" ? `https://en.wikipedia.org/?curid=${hit.pageid}` : undefined)).filter((value: Candidate | null): value is Candidate => value !== null);
}

async function openstreetmap(lat: number, lng: number): Promise<Candidate[]> {
  const around = `around:1500,${lat},${lng}`;
  const query = `[out:json][timeout:5];(nwr["name"]["tourism"~"^(attraction|viewpoint|artwork|museum|gallery)$"](${around});nwr["name"]["historic"](${around});nwr["name"]["leisure"~"^(park|garden)$"](${around});nwr["name"]["amenity"~"^(fountain|library|cafe)$"](${around}););out center;`;
  const body = await fetchJson("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", "User-Agent": "AnteApp/1.0 (https://github.com/yusufshaikh719/YCConsumerMobileHacks)" }, body: new URLSearchParams({ data: query }).toString() });
  const elements = Array.isArray(body?.elements) ? body.elements : [];
  return elements.map((element: any) => candidate(lat, lng, element.tags?.name, element.lat ?? element.center?.lat, element.lon ?? element.center?.lon, element.tags?.description, "openstreetmap", ["node", "way", "relation"].includes(element.type) && Number.isInteger(element.id) ? `https://www.openstreetmap.org/${element.type}/${element.id}` : undefined)).filter((value: Candidate | null): value is Candidate => value !== null);
}

function fallbackCandidate(lat: number, lng: number): Candidate {
  const landmarks = [
    { name: "Oracle Park", lat: 37.7786, lng: -122.3893, summary: "Look for the waterfront ballpark and its distinctive brick arches." },
    { name: "Crane Cove Park", lat: 37.7584, lng: -122.3868, summary: "Look for the historic shipyard cranes on the waterfront." },
    { name: "The Embarcadero", lat: 37.7937, lng: -122.3917, summary: "Look for the waterfront promenade and bay views." },
  ];
  for (const landmark of landmarks) {
    const found = candidate(lat, lng, landmark.name, landmark.lat, landmark.lng, landmark.summary, "curated_fallback");
    if (found) return found;
  }
  const destLat = lat <= 89.99 ? lat + 850 / 111_195 : lat - 850 / 111_195;
  return { destName: "Neighborhood waypoint", destLat, destLng: lng, destSummary: "Explore the area around this map waypoint.", destSource: "curated_fallback", distanceMeters: Math.round(haversineMeters(lat, lng, destLat, lng)) };
}

async function curate(candidates: Candidate[]): Promise<{ index: number; instruction: string } | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) return null;
  const prompt = `Pick the most interesting destination from these numbered walking destinations. Return only JSON with index (zero-based integer) and instruction (one or two sentences naming the destination and what to look for). Destinations: ${JSON.stringify(candidates.map(({ destName, destSummary, distanceMeters }) => ({ destName, destSummary, distanceMeters })))}`;
  try {
    let text: string;
    if (geminiKey) {
      const body = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_VLM_MODEL || "gemini-2.5-flash")}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } }) });
      text = body.candidates[0].content.parts[0].text;
    } else {
      const body = await fetchJson("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` }, body: JSON.stringify({ model: process.env.OPENAI_VLM_MODEL || "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }) });
      text = body.choices[0].message.content;
    }
    const result = JSON.parse(text);
    if (!Number.isInteger(result.index) || result.index < 0 || result.index >= candidates.length || typeof result.instruction !== "string") return null;
    const instruction = result.instruction.trim().slice(0, 500);
    if (!instruction || !instruction.toLowerCase().includes(candidates[result.index].destName.toLowerCase())) return null;
    return { index: result.index, instruction };
  } catch {
    return null;
  }
}

export const discoverNearbySidequest = action({
  args: { lat: v.number(), lng: v.number() },
  handler: async (_ctx, { lat, lng }): Promise<Discovery> => {
    if (!validCoordinates(lat, lng)) throw new Error("Invalid coordinates");
    const results = await Promise.allSettled([wikipedia(lat, lng), openstreetmap(lat, lng)]);
    const candidates = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
    const selected = candidates.length ? await curate(candidates) : null;
    const destination = candidates[selected?.index ?? 0] ?? fallbackCandidate(lat, lng);
    const allottedMinutes = walkingMinutes(destination.distanceMeters);
    return { ...destination, title: `Walk to ${destination.destName}`, instruction: selected?.instruction ?? `Walk to ${destination.destName}. ${destination.destSummary}`, allottedMinutes, targetRadiusMeters: 65, mode: selected ? "live" : "fallback" };
  },
});

const discoveryFields = {
  title: v.string(), instruction: v.string(), destName: v.string(), destLat: v.number(), destLng: v.number(), destSummary: v.string(),
  destSource: v.union(v.literal("wikipedia"), v.literal("openstreetmap"), v.literal("curated_fallback")), destUrl: v.optional(v.string()),
  distanceMeters: v.number(), allottedMinutes: v.number(), targetRadiusMeters: v.number(), mode: v.union(v.literal("live"), v.literal("fallback")),
};

export const triggerSidequestWarning = action({
  args: { potId: v.id("pots"), userId: v.id("users"), lat: v.number(), lng: v.number() },
  handler: async (ctx, { potId, userId, lat, lng }): Promise<Id<"sidequests">> => {
    const discovery: Discovery = await ctx.runAction(api.sidequests.discoverNearbySidequest, { lat, lng });
    return await ctx.runMutation(internal.sidequests.createWarning, { potId, userId, lat, lng, discovery });
  },
});

export const createWarning = internalMutation({
  args: { potId: v.id("pots"), userId: v.id("users"), lat: v.number(), lng: v.number(), discovery: v.object(discoveryFields) },
  handler: async (ctx, { potId, userId, lat, lng, discovery }): Promise<Id<"sidequests">> => {
    const pot = await ctx.db.get(potId);
    if (!pot || pot.status !== "active") throw new Error("Pot is not active");
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique();
    if (!member || member.stakeStatus !== "funded") throw new Error("A funded membership is required");
    if (member.completedDays.includes(pot.currentDayIndex)) throw new Error("Today's sidequest is already completed");
    const existing = await ctx.db.query("sidequests").withIndex("by_pot_user_day", q => q.eq("potId", potId).eq("userId", userId).eq("dayIndex", pot.currentDayIndex)).collect();
    const current = existing.find(quest => quest.status === "warning_5m" || quest.status === "active" || quest.status === "completed");
    if (current) return current._id;
    const now = Date.now();
    const startsAt = now + 5 * 60_000;
    const expiresAt = startsAt + discovery.allottedMinutes * 60_000;
    if (expiresAt > pot.nextDeadlineAt) throw new Error("Not enough time before the daily cutoff for this sidequest");
    const { mode: _mode, ...destination } = discovery;
    const sidequestId = await ctx.db.insert("sidequests", { potId, userId, dayIndex: pot.currentDayIndex, status: "warning_5m", originLat: lat, originLng: lng, ...destination, warningSentAt: now, startsAt, expiresAt });
    await ctx.scheduler.runAt(startsAt, internal.sidequests.activateSidequest, { sidequestId });
    await ctx.scheduler.runAt(expiresAt, internal.sidequests.timeoutSidequest, { sidequestId });
    await ctx.scheduler.runAfter(0, internal.whop.postChatAnnouncement, { potId, message: `Sidequest starts in 5 minutes: ${destination.title}. ${destination.instruction}` });
    return sidequestId;
  },
});

export const activateSidequest = internalMutation({
  args: { sidequestId: v.id("sidequests") },
  handler: async (ctx, { sidequestId }): Promise<boolean> => {
    const quest = await ctx.db.get(sidequestId);
    if (!quest || quest.status !== "warning_5m" || Date.now() < quest.startsAt) return false;
    const pot = await ctx.db.get(quest.potId);
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", quest.potId).eq("userId", quest.userId)).unique();
    if (!pot || pot.status !== "active" || pot.currentDayIndex !== quest.dayIndex || !member || member.stakeStatus !== "funded" || member.completedDays.includes(quest.dayIndex) || Date.now() >= Math.min(quest.expiresAt, pot.nextDeadlineAt)) {
      await ctx.db.patch(sidequestId, { status: "failed_timeout" });
      return true;
    }
    const expiresAt = Math.min(quest.expiresAt, pot.nextDeadlineAt);
    await ctx.db.patch(sidequestId, { status: "active", expiresAt });
    if (expiresAt < quest.expiresAt) await ctx.scheduler.runAt(expiresAt, internal.sidequests.timeoutSidequest, { sidequestId });
    return true;
  },
});

export const timeoutSidequest = internalMutation({
  args: { sidequestId: v.id("sidequests") },
  handler: async (ctx, { sidequestId }): Promise<boolean> => {
    const quest = await ctx.db.get(sidequestId);
    if (!quest || !["warning_5m", "active"].includes(quest.status) || Date.now() < quest.expiresAt) return false;
    const walk = await ctx.db.query("walkSubmissions").withIndex("by_sidequest", q => q.eq("sidequestId", sidequestId)).unique();
    if (walk?.verdict === "pending") return false;
    await ctx.db.patch(sidequestId, { status: "failed_timeout" });
    return true;
  },
});

export const startSidequestNow = mutation({
  args: { sidequestId: v.id("sidequests") },
  handler: async (ctx, { sidequestId }): Promise<boolean> => {
    const quest = await ctx.db.get(sidequestId);
    if (!quest || quest.status !== "warning_5m") return false;
    const startsAt = Date.now();
    const pot = await ctx.db.get(quest.potId);
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", quest.potId).eq("userId", quest.userId)).unique();
    if (!pot || pot.status !== "active" || pot.currentDayIndex !== quest.dayIndex || !member || member.stakeStatus !== "funded" || member.completedDays.includes(quest.dayIndex)) throw new Error("Sidequest is no longer available");
    const expiresAt = startsAt + quest.allottedMinutes * 60_000;
    if (expiresAt > pot.nextDeadlineAt) throw new Error("Not enough time before the daily cutoff for this sidequest");
    await ctx.db.patch(sidequestId, { status: "active", startsAt, expiresAt });
    await ctx.scheduler.runAt(expiresAt, internal.sidequests.timeoutSidequest, { sidequestId });
    return true;
  },
});

export const getSidequest = query({
  args: { sidequestId: v.id("sidequests") },
  handler: async (ctx, { sidequestId }) => await ctx.db.get(sidequestId),
});

export const getActiveSidequestForUser = query({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }) => {
    const pot = await ctx.db.get(potId);
    if (!pot) return null;
    return await ctx.db.query("sidequests")
      .withIndex("by_pot_user_day", q => q.eq("potId", potId).eq("userId", userId).eq("dayIndex", pot.currentDayIndex))
      .order("desc").first();
  },
});

export const getNextAvailabilityDispatch = query({
  args: { potId: v.id("pots"), userId: v.id("users"), now: v.number() },
  handler: async (ctx, { potId, userId, now }) => {
    if (!Number.isFinite(now)) throw new Error("Invalid time");
    const availability = await ctx.db.query("availabilityWindows")
      .withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique();
    return availability ? findNextDispatchTime(availability.slots, now, availability.timezone) : null;
  },
});
