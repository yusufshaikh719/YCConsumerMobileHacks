import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const secret = "ws_test_premium_signing_secret";

async function fixture() {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", {
    name: "Alex", handle: "alex", simulatedWalletBalanceCents: 0, createdAt: Date.now(),
  }));
  return { t, userId };
}

async function signedHeaders(body: string, id = "evt_premium", age = 0) {
  const timestamp = Math.floor(Date.now() / 1000) - age;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return {
    "webhook-id": id, "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${btoa(String.fromCharCode(...bytes))}`,
  };
}

beforeEach(() => {
  vi.stubEnv("WHOP_API_KEY", "test_api_key");
  vi.stubEnv("WHOP_WEBHOOK_SECRET", secret);
  vi.stubEnv("WHOP_ENVIRONMENT", "sandbox");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("premium checkout", () => {
  it("creates a sandbox SDK checkout with user metadata and leaves access locked", async () => {
    const { t, userId } = await fixture();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe("https://sandbox-api.whop.com/api/v1/checkout_configurations");
      expect(request.headers.get("authorization")).toBe("Bearer test_api_key");
      expect(await request.json()).toMatchObject({
        variant: { title: "Ante Premium", initial_price: 10, currency: "usd", billing_type: "one_time" },
        metadata: { userId, purpose: "premium", purchaseId: expect.any(String) },
      });
      return new Response(JSON.stringify({ id: "ch_premium", purchase_url: "https://sandbox.whop.com/checkout/premium" }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await t.action(api.whop.createPremiumCheckout, { userId })).toEqual({ purchase_url: "https://sandbox.whop.com/checkout/premium", mode: "live" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: false });
    expect(await t.run(ctx => ctx.db.query("premiumPurchases").collect())).toMatchObject([{ userId, whopCheckoutId: "ch_premium" }]);
  });

  it("fails closed without configuration and for premium or missing users", async () => {
    const { t, userId } = await fixture();
    vi.stubEnv("WHOP_API_KEY", "");
    expect(await t.action(api.whop.createPremiumCheckout, { userId })).toEqual({ purchase_url: null, mode: "fallback" });
    vi.stubEnv("WHOP_API_KEY", "test_api_key");
    await t.run(ctx => ctx.db.patch(userId, { isPremium: true }));
    await expect(t.action(api.whop.createPremiumCheckout, { userId })).rejects.toThrow("already premium");
    await t.run(ctx => ctx.db.delete(userId));
    await expect(t.action(api.whop.createPremiumCheckout, { userId })).rejects.toThrow("User not found");
  });

  it("does not unlock or simulate success when Whop rejects checkout", async () => {
    const { t, userId } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Invalid checkout" } }), {
      status: 400, headers: { "content-type": "application/json" },
    })));
    expect(await t.action(api.whop.createPremiumCheckout, { userId })).toEqual({ purchase_url: null, mode: "fallback" });
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: false });
  });

  it("falls back within eight seconds when Whop does not respond", async () => {
    vi.useFakeTimers();
    const { t, userId } = await fixture();
    let started!: () => void;
    const requestStarted = new Promise<void>(resolve => { started = resolve; });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      started();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const checkout = t.action(api.whop.createPremiumCheckout, { userId });
    await requestStarted;
    await vi.advanceTimersByTimeAsync(8000);
    expect(await checkout).toEqual({ purchase_url: null, mode: "fallback" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: false });
  });
});

describe("premium webhook", () => {
  async function paymentFixture() {
    const { t, userId } = await fixture();
    const purchaseId = await t.mutation(internal.premium.startPurchase, { userId });
    await t.mutation(internal.premium.attachCheckout, { purchaseId, whopCheckoutId: "ch_premium" });
    const event = { type: "payment.succeeded", data: {
      id: "pay_premium", checkout_configuration_id: "ch_premium", currency: "usd",
      total: { amount: "10.00", currency: "usd" },
      metadata: { purpose: "premium", userId, purchaseId },
    } };
    return { t, userId, purchaseId, event };
  }

  it("unlocks only the paid user and handles event and payment replays idempotently", async () => {
    const { t, userId, event } = await paymentFixture();
    const otherId = await t.run(ctx => ctx.db.insert("users", {
      name: "Bee", handle: "bee", simulatedWalletBalanceCents: 0, createdAt: Date.now(),
    }));
    const body = JSON.stringify(event);
    for (const id of ["evt_premium", "evt_premium", "evt_replay"]) {
      const response = await t.fetch("/whop", { method: "POST", body, headers: await signedHeaders(body, id) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ premium: true });
    }
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: true });
    expect(await t.query(api.premium.getStatus, { userId: otherId })).toEqual({ isPremium: false });
    expect(await t.run(ctx => ctx.db.query("webhookEvents").collect())).toHaveLength(1);
  });

  it("rejects unsigned, forged, tampered and stale payloads without granting access", async () => {
    const { t, userId, event } = await paymentFixture();
    const body = JSON.stringify(event);
    for (const headers of [{}, { ...await signedHeaders(body), "webhook-signature": "v1,YmFk" }, await signedHeaders(`${body} `), await signedHeaders(body, "evt_stale", 600)]) {
      expect((await t.fetch("/whop", { method: "POST", body, headers })).status).toBe(401);
    }
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "");
    expect((await t.fetch("/whop", { method: "POST", body, headers: await signedHeaders(body) })).status).toBe(503);
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: false });
  });

  it("ignores other event types and stake payments", async () => {
    const { t, userId, event } = await paymentFixture();
    for (const payload of [{ ...event, type: "payment.failed" }, { ...event, data: { ...event.data, metadata: { userId } } }]) {
      const body = JSON.stringify(payload);
      const response = await t.fetch("/whop", { method: "POST", body, headers: await signedHeaders(body) });
      expect(await response.json()).toMatchObject({ ignored: true });
    }
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: false });
  });

  it("rejects insufficient, wrong-currency, mismatched-checkout and invalid-user payments", async () => {
    const { t, userId, event } = await paymentFixture();
    for (const data of [
      { ...event.data, tax_amount: { amount: "1.00", currency: "usd" } },
      { ...event.data, total: { amount: "10.00", currency: "eur" } },
      { ...event.data, currency: "eur" },
      { ...event.data, checkout_configuration_id: "ch_other" },
      { ...event.data, metadata: { ...event.data.metadata, userId: "invalid" } },
      { ...event.data, metadata: { ...event.data.metadata, purchaseId: "invalid" } },
    ]) {
      const body = JSON.stringify({ ...event, data });
      expect((await t.fetch("/whop", { method: "POST", body, headers: await signedHeaders(body) })).status).toBe(400);
    }
    expect(await t.query(api.premium.getStatus, { userId })).toEqual({ isPremium: false });
  });
});
