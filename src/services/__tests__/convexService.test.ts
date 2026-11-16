import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";
import { devQuest } from "../../dev/devQuest";
import { PING_LEAD_MS } from "../../lib/time";
import { availabilitySlots, createConvexService, type Backend } from "../convexService";
import { memoryStorage } from "../memoryStorage";
import { passedMembers } from "../standings";
import type { AnteService, Landmark, LatLng } from "../types";

const modules = import.meta.glob("../../../convex/**/*.ts");
const origin: LatLng = { lat: 37.7694, lng: -122.4862 };
const landmark = (n: number): Landmark => ({ id: `wiki-${n}`, name: `Landmark ${n}`, neighborhood: "Inner Sunset", coords: { lat: origin.lat + 0.0072, lng: origin.lng + n * 0.0001 }, thumbnail: { uri: `https://upload.wikimedia.org/${n}.jpg` }, trivia: "Built in 1902.", source: "Wikipedia", radiusMeters: 50 });

function connect(t: TestConvex<typeof schema>) {
  const watchers = new Set<() => Promise<void>>();
  const refresh = async () => {
    for (const run of [...watchers]) await run();
  };
  const backend = {
    query: (ref: any, args: any) => t.query(ref, args),
    action: async (ref: any, args: any) => {
      const result = await t.action(ref, args);
      await refresh();
      return result;
    },
    mutation: async (ref: any, args: any) => {
      const result = await t.mutation(ref, args);
      await refresh();
      return result;
    },
    watchQuery: (ref: any, args: any) => {
      let value: unknown;
      const listeners = new Set<() => void>();
      const run = async () => {
        value = await t.query(ref, args);
        listeners.forEach(listener => listener());
      };
      watchers.add(run);
      void run();
      return { localQueryResult: () => value, onUpdate: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)) };
    },
  };
  return { backend: backend as unknown as Backend, refresh };
}

async function phone(t: TestConvex<typeof schema>, backend: Backend, name: string, storage = memoryStorage()) {
  let n = 0;
  const service = createConvexService({
    client: backend,
    storage,
    discover: async () => landmark(++n + name.length * 10),
    upload: async () => await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" }))),
    timezone: () => "America/Los_Angeles",
  });
  await service.load();
  await service.setName(name);
  return { service, storage };
}

async function complete(service: AnteService, photo: string | null = "file:///selfie.jpg", at?: LatLng) {
  const quest = await service.startSidequest(Date.now() - PING_LEAD_MS - 60_000, origin);
  return { quest, result: await service.verifyArrival(quest, photo, { ...(at ?? quest.landmark.coords), accuracy: 10 }) };
}

beforeEach(() => {
  vi.stubEnv("WHOP_API_KEY", "test_api_key");
  vi.stubEnv("WHOP_COMPANY_ID", "biz_test");
  vi.stubEnv("WHOP_ENVIRONMENT", "sandbox");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("convex service identity", () => {
  it("creates a stable per-device id on first launch and keeps it across restarts", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const storage = memoryStorage();
    const first = createConvexService({ client: backend, storage, newDeviceId: () => "device-first-1" });
    await first.load();
    expect(JSON.parse((await storage.read())!).deviceId).toBe("device-first-1");
    const again = createConvexService({ client: backend, storage, newDeviceId: () => "device-other-2" });
    await again.load();
    await again.setName("Aahil");
    await again.createGroup("");
    const users = await t.run(ctx => ctx.db.query("users").collect());
    expect(users.map(u => [u.deviceId, u.name])).toEqual([["device-first-1", "Aahil"]]);
    expect(again.getSnapshot()).toMatchObject({ backend: "convex", group: { name: "Aahil's group", joined: false } });
  });
});

describe("convex service group sync", () => {
  it("joins by code or link, and both phones see both members", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const a = await phone(t, backend, "Aahil Shaikh");
    const b = await phone(t, backend, "Yusuf");
    await a.service.createGroup("Hill crew");
    const code = a.service.getSnapshot().group.inviteCode;
    expect(code).toMatch(/^[0-9A-Z]{6}$/);
    expect(await b.service.joinGroup("not a code!")).toBe(false);
    expect(await b.service.joinGroup("ZZZZZZ")).toBe(false);
    expect(await b.service.joinGroup(`ante://join/${code}`)).toBe(true);
    for (const { service } of [a, b]) {
      const data = service.getSnapshot();
      expect(data.group.name).toBe("Hill crew");
      expect(data.group.members.map(m => m.fullName)).toEqual(["Aahil Shaikh", "Yusuf"]);
      expect(data.funding).toMatchObject({ payments: "sandbox", myStake: "unpaid", paidCount: 0 });
    }
    expect(b.service.getSnapshot().group.joined).toBe(true);
    expect(b.service.getSnapshot().group.members.find(m => m.id === b.service.getSnapshot().meId)?.name).toBe("You");
  });

  it("syncs sidequest windows to Convex availability for every weekday", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const a = await phone(t, backend, "Aahil");
    await a.service.createGroup("");
    await a.service.setWindows([{ startMinute: 17 * 60, endMinute: 19 * 60 }, { startMinute: 12 * 60, endMinute: 13 * 60 }]);
    const data = a.service.getSnapshot();
    const saved = await t.query(api.availability.getUserAvailability, { potId: JSON.parse((await a.storage.read())!).potId as Id<"pots">, userId: data.meId as Id<"users"> });
    expect(saved).toMatchObject({ timezone: "America/Los_Angeles" });
    expect(saved!.slots).toEqual(availabilitySlots(data.windows));
    expect(saved!.slots).toHaveLength(14);
  });
});

describe("convex service shared standings", () => {
  it("records a completion with its selfie that the other phone sees, ranks it, and names who you passed", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const a = await phone(t, backend, "Aahil");
    const b = await phone(t, backend, "Yusuf");
    await a.service.createGroup("");
    await b.service.joinGroup(a.service.getSnapshot().group.inviteCode);
    expect((await complete(a.service)).result.ok).toBe(true);
    const seen = b.service.getSnapshot();
    expect(seen.postcards).toHaveLength(1);
    expect(seen.postcards[0]).toMatchObject({ memberId: a.service.getSnapshot().meId, landmark: { thumbnail: { uri: expect.stringContaining("wikimedia") } } });
    expect(seen.postcards[0].photo).toMatchObject({ uri: expect.any(String) });
    expect(seen.postcards[0].verifiedBy).toBe("gps_only");
    expect(seen.standings[0].member.fullName).toBe("Aahil");
    await complete(b.service, null);
    const { result } = await complete(b.service, null);
    if (!result.ok) throw new Error("expected a stamp");
    expect(passedMembers(result.before, result.after, b.service.getSnapshot().meId).map(m => m.fullName)).toEqual(["Aahil"]);
    expect(a.service.getSnapshot().standings.map(s => [s.member.name, s.completed, s.rank])).toEqual([["Yusuf", 2, 1], ["You", 1, 2]]);
    const card = a.service.getSnapshot().postcards[0];
    await a.service.react(card.id, "🔥");
    expect(b.service.getSnapshot().postcards.find(p => p.id === card.id)!.reactions["🔥"]).toEqual([a.service.getSnapshot().meId]);
  });

  it("registers a dev-switcher quest on the server before verifying it", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const a = await phone(t, backend, "Aahil");
    await a.service.createGroup("");
    const quest = devQuest(Date.now() - PING_LEAD_MS - 11 * 60_000);
    const result = await a.service.verifyArrival(quest, null, quest.landmark.coords);
    expect(result).toMatchObject({ ok: true, postcard: { landmark: { name: "Y Combinator" } } });
  });

  it("is not verified away from the landmark, and records nothing", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const a = await phone(t, backend, "Aahil");
    await a.service.createGroup("");
    const { result } = await complete(a.service, null, origin);
    expect(result).toEqual({ ok: false, reason: "not_verified" });
    expect(a.service.getSnapshot().postcards).toEqual([]);
  });
});

describe("convex service Whop sandbox buy-in", () => {
  it("opens a sandbox checkout, and the credited pot shows on every phone", async () => {
    const t = convexTest(schema, modules);
    const { backend, refresh } = connect(t);
    const a = await phone(t, backend, "Aahil");
    const b = await phone(t, backend, "Yusuf");
    await a.service.createGroup("");
    await b.service.joinGroup(a.service.getSnapshot().group.inviteCode);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "ch_1", purchase_url: "https://sandbox.whop.com/checkout/ch_1/" }))));
    expect(await a.service.buyIn()).toEqual({ url: "https://sandbox.whop.com/checkout/ch_1/", mode: "live" });
    const potId = JSON.parse((await a.storage.read())!).potId as Id<"pots">;
    await t.mutation(internal.pots.confirmWhopStake, { potId, userId: a.service.getSnapshot().meId as Id<"users">, whopPaymentId: "pay_1", eventId: "evt_1", mode: "live" });
    await refresh();
    expect(a.service.getSnapshot()).toMatchObject({ potCents: 2000, funding: { myStake: "paid", paidCount: 1 } });
    expect(b.service.getSnapshot()).toMatchObject({ potCents: 2000, funding: { myStake: "unpaid", paidCount: 1 } });
  });

  it("labels checkout as a fallback when Whop returns no usable URL", async () => {
    const t = convexTest(schema, modules);
    const { backend } = connect(t);
    const a = await phone(t, backend, "Aahil");
    await a.service.createGroup("");
    vi.stubEnv("WHOP_COMPANY_ID", "");
    expect(await a.service.buyIn()).toEqual({ url: null, mode: "fallback" });
  });
});
