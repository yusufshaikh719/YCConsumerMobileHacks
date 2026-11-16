import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
type Backend = TestConvex<typeof schema>;
const NOW = Date.UTC(2026, 10, 18, 20, 0);
const WEEK_END = Date.UTC(2026, 10, 23, 5, 0);
const webhookSecret = "ws_test_ante_signing_secret";
const secretBytes = new TextEncoder().encode(webhookSecret);
const origin = { lat: 37.7694, lng: -122.4862 };
const landmark = { id: "wiki-42", name: "Old Mill Fountain", neighborhood: "Riverside park", lat: origin.lat + 0.0072, lng: origin.lng, trivia: "Pumped water until 1902.", source: "Wikipedia" as const, radiusMeters: 50 };

async function signedHeaders(body: string, id = "msg_123") {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${btoa(String.fromCharCode(...bytes))}` };
}

async function group(t: Backend) {
  await t.mutation(api.ante.ensureUser, { deviceId: "device-aahil-1", name: "Aahil Shaikh" });
  await t.mutation(api.ante.ensureUser, { deviceId: "device-yusuf-1", name: "Yusuf" });
  const created = await t.mutation(api.ante.createGroup, { deviceId: "device-aahil-1", name: "Hill crew", weekEndsAt: WEEK_END });
  const joined = await t.mutation(api.ante.joinGroup, { deviceId: "device-yusuf-1", inviteCode: ` ${created.inviteCode.toLowerCase()} ` });
  return { ...created, joined };
}

async function stamp(t: Backend, deviceId: string, potId: Id<"pots">, position = landmark, photoStorageId?: Id<"_storage">) {
  const sidequestId = await t.mutation(api.ante.startQuest, { deviceId, potId, landmark, originLat: origin.lat, originLng: origin.lng, pingAt: Date.now() - 60_000, revealAt: Date.now(), expiresAt: Date.now() + 25 * 60_000 });
  vi.advanceTimersByTime(12 * 60_000);
  return await t.action(api.ante.submitArrival, { deviceId, sidequestId, lat: position.lat, lng: position.lng, accuracy: 8, ...(photoStorageId ? { photoStorageId } : {}) });
}

async function fund(t: Backend, potId: Id<"pots">, deviceId: string, paymentId: string, whopUser: string) {
  const state = await t.query(api.ante.getGroup, { deviceId, potId });
  const body = JSON.stringify({ type: "payment.succeeded", data: {
    id: paymentId, account_id: "biz_test", currency: "usd", total: { amount: "20.00", currency: "usd" }, checkout_configuration_id: `ch_${paymentId}`,
    user: { id: whopUser }, metadata: { potId, userId: state!.meId, purpose: "pot" },
  } });
  return await t.fetch("/whop", { method: "POST", body, headers: await signedHeaders(body, `msg_${paymentId}`) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("WHOP_API_KEY", "test_api_key");
  vi.stubEnv("WHOP_COMPANY_ID", "biz_test");
  vi.stubEnv("WHOP_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("WHOP_ENVIRONMENT", "sandbox");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("demo identity", () => {
  it("keeps one user per device and updates the name", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.ante.ensureUser, { deviceId: "device-aahil-1", name: " Aahil " });
    const again = await t.mutation(api.ante.ensureUser, { deviceId: "device-aahil-1", name: "Aahil Shaikh" });
    expect(again).toBe(first);
    expect(await t.run(ctx => ctx.db.get(first))).toMatchObject({ name: "Aahil Shaikh", deviceId: "device-aahil-1" });
    await expect(t.mutation(api.ante.ensureUser, { deviceId: "short", name: "x" })).rejects.toThrow("Invalid device id");
    await expect(t.mutation(api.ante.createGroup, { deviceId: "device-unknown", name: "x", weekEndsAt: WEEK_END })).rejects.toThrow("Unknown device");
  });
});

describe("groups and invites", () => {
  it("creates a weekly pot with an invite code that a second device joins, and both see both members", async () => {
    const t = convexTest(schema, modules);
    const { potId, inviteCode, joined } = await group(t);
    expect(inviteCode).toMatch(/^[0-9A-Z]{6}$/);
    expect(joined).toEqual({ potId, inviteCode });
    for (const deviceId of ["device-aahil-1", "device-yusuf-1"]) {
      const state = await t.query(api.ante.getGroup, { deviceId, potId });
      expect(state).toMatchObject({ title: "Hill crew", inviteCode, stakeCents: 2000, potCents: 0, weekEndsAt: WEEK_END, payments: "sandbox" });
      expect(state!.members.map(m => [m.name, m.stakeStatus])).toEqual([["Aahil Shaikh", "pending_checkout"], ["Yusuf", "pending_checkout"]]);
    }
    expect(await t.mutation(api.ante.joinGroup, { deviceId: "device-yusuf-1", inviteCode: "ZZZZZZ" })).toBeNull();
    await t.mutation(api.ante.ensureUser, { deviceId: "device-stranger", name: "Stranger" });
    expect(await t.query(api.ante.getGroup, { deviceId: "device-stranger", potId })).toBeNull();
  });

  it("reports payments as unavailable without a Whop company", async () => {
    vi.stubEnv("WHOP_COMPANY_ID", "");
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    expect((await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!.payments).toBe("unavailable");
  });
});

describe("shared stamps", () => {
  it("records a geofenced completion that every member sees, with reactions", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    const result = await stamp(t, "device-yusuf-1", potId);
    expect(result).toMatchObject({ ok: true });
    const seen = await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId });
    expect(seen!.stamps).toHaveLength(1);
    expect(seen!.stamps[0]).toMatchObject({ minutesTaken: 12, photoUrl: null, landmark: { name: "Old Mill Fountain" } });
    expect(seen!.stamps[0].userId).toBe(seen!.members[1].userId);
    const stampId = result.ok ? result.stampId : (null as never);
    await t.mutation(api.ante.react, { deviceId: "device-aahil-1", stampId, reaction: "🔥" });
    const reacted = await t.query(api.ante.getGroup, { deviceId: "device-yusuf-1", potId });
    expect(reacted!.stamps[0].reactions).toEqual([{ userId: seen!.members[0].userId, reaction: "🔥" }]);
    await t.mutation(api.ante.react, { deviceId: "device-aahil-1", stampId, reaction: "🔥" });
    expect((await t.query(api.ante.getGroup, { deviceId: "device-yusuf-1", potId }))!.stamps[0].reactions).toEqual([]);
    await expect(t.mutation(api.ante.react, { deviceId: "device-aahil-1", stampId, reaction: "💩" })).rejects.toThrow("Unknown reaction");
  });

  it("rejects a completion outside the landmark geofence and after the window", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    expect(await stamp(t, "device-aahil-1", potId, { ...landmark, lat: landmark.lat - 0.002 })).toMatchObject({ ok: false, reason: "outside_geofence" });
    const sidequestId = await t.mutation(api.ante.startQuest, { deviceId: "device-aahil-1", potId, landmark: { ...landmark, id: "wiki-43" }, originLat: origin.lat, originLng: origin.lng, pingAt: Date.now(), revealAt: Date.now(), expiresAt: Date.now() + 20 * 60_000 });
    vi.advanceTimersByTime(30 * 60_000);
    expect(await t.action(api.ante.submitArrival, { deviceId: "device-aahil-1", sidequestId, lat: landmark.lat, lng: landmark.lng })).toEqual({ ok: false, reason: "expired" });
    expect((await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!.stamps).toEqual([]);
  });

  it("refuses a landmark registered where you already stand", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    await expect(t.mutation(api.ante.startQuest, { deviceId: "device-aahil-1", potId, landmark, originLat: landmark.lat, originLng: landmark.lng, pingAt: Date.now(), revealAt: Date.now(), expiresAt: Date.now() + 20 * 60_000 })).rejects.toThrow("not a real walk away");
  });
});

describe("selfie referee", () => {
  function openai(verdict: object) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
      const body = await request.json();
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.messages[0].content[0].text).toContain("arrival selfie for a walking sidequest to Old Mill Fountain");
      expect(body.messages[0].content[1].image_url.url).toEqual(expect.any(String));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ visualSpoofReasons: [], confidence: 0.86, roastMessage: "Fountain confirmed, hair questionable.", ...verdict }) } }] }));
    });
    vi.stubEnv("OPENAI_API_KEY", "test_openai_key");
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("stamps a selfie the VLM accepts and records it as an AI photo check", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    const fetchMock = openai({ landmarkPassed: true, visualSpoofDetected: false });
    const photo = await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(await stamp(t, "device-aahil-1", potId, landmark, photo)).toMatchObject({ ok: true, verifiedBy: "photo_ai", note: "Fountain confirmed, hair questionable." });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await t.query(api.ante.getGroup, { deviceId: "device-yusuf-1", potId }))!.stamps[0]).toMatchObject({ verifiedBy: "photo_ai", photoUrl: expect.any(String) });
  });

  it("rejects a selfie the VLM flags, and stamps nothing", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    openai({ landmarkPassed: true, visualSpoofDetected: true, visualSpoofReasons: ["photo of a screen"] });
    const photo = await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(await stamp(t, "device-aahil-1", potId, landmark, photo)).toEqual({ ok: false, reason: "photo_rejected", note: "photo of a screen" });
    expect((await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!.stamps).toEqual([]);
  });

  it("tells the model to pass ambiguous indoor backgrounds and stamps a plain-wall selfie", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    const fetchMock = openai({ landmarkPassed: true, visualSpoofDetected: false, roastMessage: "Riveting wall, great face." });
    const photo = await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(await stamp(t, "device-aahil-1", potId, landmark, photo)).toMatchObject({ ok: true, verifiedBy: "photo_ai" });
    const prompt: string = JSON.parse(fetchMock.mock.calls[0][1]!.body as string).messages[0].content[0].text;
    expect(prompt).toContain("A plain wall, a lobby, a hallway, a door");
    expect(prompt).toContain("only when there is no person in the photo, or the background is plainly a different place");
    expect(prompt).toContain("blank or almost entirely black");
  });

  it("stamps a selfie the model only doubts with low confidence", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    openai({ landmarkPassed: false, visualSpoofDetected: false, visualSpoofReasons: ["Hard to tell where this is"], confidence: 0.5 });
    const photo = await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(await stamp(t, "device-aahil-1", potId, landmark, photo)).toMatchObject({ ok: true, verifiedBy: "photo_ai" });
    expect((await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!.stamps).toHaveLength(1);
  });

  it.each([
    ["a clearly different location", { landmarkPassed: false, visualSpoofDetected: false, visualSpoofReasons: ["That looks like a beach, not Old Mill Fountain"], confidence: 0.92 }, "That looks like a beach, not Old Mill Fountain"],
    ["no person in the shot", { landmarkPassed: false, visualSpoofDetected: false, visualSpoofReasons: ["No one's in the shot"], confidence: 0.9 }, "No one's in the shot"],
    ["a blank or black photo", { landmarkPassed: true, visualSpoofDetected: true, visualSpoofReasons: ["That photo is completely black"], confidence: 0.97 }, "That photo is completely black"],
  ])("rejects %s with the model's short reason", async (_, verdict, note) => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    openai(verdict);
    const photo = await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(await stamp(t, "device-aahil-1", potId, landmark, photo)).toEqual({ ok: false, reason: "photo_rejected", note });
    expect((await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!.stamps).toEqual([]);
  });

  it("falls back to a GPS-only stamp, labeled as such, when the VLM call fails", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    vi.stubEnv("OPENAI_API_KEY", "test_openai_key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 502 })));
    const photo = await t.run(ctx => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));
    expect(await stamp(t, "device-aahil-1", potId, landmark, photo)).toMatchObject({ ok: true, verifiedBy: "gps_only" });
  });
});

describe("Whop sandbox pot", () => {
  it("opens a sandbox checkout tagged as a pot buy-in", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    const { meId } = (await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe("https://sandbox-api.whop.com/api/v1/checkout_configurations");
      expect(await request.json()).toMatchObject({ account_id: "biz_test", variant: { initial_price: 20 }, metadata: { potId, userId: meId, purpose: "pot" } });
      return new Response(JSON.stringify({ id: "ch_live", purchase_url: "https://sandbox.whop.com/checkout/ch_live/" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await t.action(api.whop.createPotCheckout, { potId, userId: meId })).toEqual({ checkoutId: "ch_live", checkoutUrl: "https://sandbox.whop.com/checkout/ch_live/", mode: "live" });
  });

  it("credits the pot from the signed webhook once, records the payer, and pays the weekly winner through a Whop transfer", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/transfers")) {
        expect(await request.json()).toMatchObject({ origin_id: "biz_test", destination_id: "user_whop_yusuf", amount: 40 });
        return new Response(JSON.stringify({ id: "xfer_1", status: "succeeded" }));
      }
      return new Response(JSON.stringify({ id: "msg_post" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await fund(t, potId, "device-aahil-1", "pay_a", "user_whop_aahil")).json()).toMatchObject({ funded: true });
    expect(await (await fund(t, potId, "device-aahil-1", "pay_a", "user_whop_aahil")).json()).toMatchObject({ duplicate: true });
    expect(await (await fund(t, potId, "device-yusuf-1", "pay_y", "user_whop_yusuf")).json()).toMatchObject({ funded: true });
    const funded = await t.query(api.ante.getGroup, { deviceId: "device-yusuf-1", potId });
    expect(funded).toMatchObject({ potCents: 4000, status: "active" });
    expect(funded!.members.map(m => m.stakeStatus)).toEqual(["funded", "funded"]);
    await stamp(t, "device-yusuf-1", potId);
    vi.setSystemTime(WEEK_END + 60_000);
    await t.mutation(internal.settlement.sweepExpiredDeadlines, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const after = await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId });
    expect(after).toMatchObject({ potCents: 0, status: "open", weekEndsAt: WEEK_END + 7 * 24 * 60 * 60 * 1000, stamps: [] });
    expect(after!.members.map(m => m.stakeStatus)).toEqual(["pending_checkout", "pending_checkout"]);
    expect(after!.lastSettlement).toMatchObject({ totalPotCents: 4000, perWinnerCents: 4000, winners: ["Yusuf"], transfers: [{ name: "Yusuf", amountCents: 4000, status: "completed", mode: "live" }] });
  });

  it("returns buy-ins when nobody stamps, and labels the payout as fallback when the winner has no Whop account", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "msg_post" }))));
    const { meId } = (await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId }))!;
    await t.mutation(internal.pots.confirmWhopStake, { potId, userId: meId, whopPaymentId: "pay_sim", eventId: "evt_sim", mode: "simulated" });
    await t.mutation(internal.ante.settleWeek, { potId, triggeredBy: "demo", force: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const after = await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId });
    expect(after!.lastSettlement).toMatchObject({ winners: ["Aahil Shaikh"], transfers: [{ amountCents: 2000, status: "fallback", mode: "fallback" }] });
  });

  it("rolls an unfunded week forward without a settlement", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await group(t);
    vi.setSystemTime(WEEK_END + 60_000);
    await t.mutation(internal.settlement.sweepExpiredDeadlines, {});
    const after = await t.query(api.ante.getGroup, { deviceId: "device-aahil-1", potId });
    expect(after).toMatchObject({ weekEndsAt: WEEK_END + 7 * 24 * 60 * 60 * 1000, lastSettlement: null, status: "open" });
  });
});
