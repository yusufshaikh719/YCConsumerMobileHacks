import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { buildCheckoutUrl, buildEmbeddedChatUrl } from "../../src/services/whop";

const modules = import.meta.glob("../**/*.ts");
type Backend = TestConvex<typeof schema>;
const secretBytes = new TextEncoder().encode("test-only-webhook-signing-key");
const webhookSecret = `whsec_${btoa(String.fromCharCode(...secretBytes))}`;

async function fixture(t: Backend, whopUserId = "user_real") {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", {
    name: "Alex", handle: "alex", whopUserId, simulatedWalletBalanceCents: 0, createdAt: Date.now(),
  }));
  const potId = await t.mutation(api.pots.createPot, {
    title: "Morning pact", habitCategory: "fitness", habitPrompt: "Go to the gym", createdByUserId: userId,
  });
  const membershipId = await t.mutation(api.pots.joinPotPendingCheckout, { potId, userId });
  return { userId, potId, membershipId };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  return { url: new URL(request.url), request };
}

async function signedHeaders(body: string, id = "evt_123", timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${btoa(String.fromCharCode(...bytes))}`,
  };
}

beforeEach(() => {
  vi.stubEnv("WHOP_API_KEY", "test_api_key");
  vi.stubEnv("WHOP_COMPANY_ID", "biz_test");
  vi.stubEnv("WHOP_WEBHOOK_SECRET", webhookSecret);
  vi.stubEnv("WHOP_DEFAULT_PRODUCT_ID", "prod_test");
  vi.stubEnv("EXPO_PUBLIC_WHOP_EMBEDDED_CHAT_CHANNEL_ID", "feed_test");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Whop checkout", () => {
  it("creates a one-time checkout with pot and player metadata", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await fixture(t);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, request } = requestDetails(input, init);
      expect(url.pathname).toMatch(/\/checkout_configurations$/);
      expect(request.method).toBe("POST");
      expect(await request.json()).toMatchObject({
        account_id: "biz_test",
        metadata: { potId, userId, potTitle: "Morning pact", habitCategory: "fitness" },
        variant: { product_id: "prod_test", initial_price: 10, currency: "usd", billing_type: "one_time" },
      });
      return json({ id: "checkout_live", purchase_url: "https://whop.com/checkout/live" });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await t.action(api.whop.createPotCheckout, { potId, userId })).toEqual({
      checkoutId: "checkout_live", checkoutUrl: "https://whop.com/checkout/live", mode: "live",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back deterministically on an API error or absent configuration", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await fixture(t);
    const fetchMock = vi.fn().mockRejectedValue(new Error("sandbox unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const fallback = { checkoutId: `fallback_checkout_${potId}_${userId}`, checkoutUrl: null, mode: "fallback" };
    expect(await t.action(api.whop.createPotCheckout, { potId, userId })).toEqual(fallback);
    vi.stubEnv("WHOP_API_KEY", "");
    fetchMock.mockClear();
    expect(await t.action(api.whop.createPotCheckout, { potId, userId })).toEqual(fallback);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects checkout for a missing pot or user", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await fixture(t);
    await t.run(async (ctx) => ctx.db.delete(userId));
    await expect(t.action(api.whop.createPotCheckout, { potId, userId })).rejects.toThrow(/user not found/i);
    await t.run(async (ctx) => ctx.db.delete(potId));
    await expect(t.action(api.whop.createPotCheckout, { potId, userId })).rejects.toThrow(/pot not found/i);
  });

  it("bounds an unresponsive checkout request to eight seconds", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { potId, userId } = await fixture(t);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    let started!: () => void;
    const fetchStarted = new Promise<void>((resolve) => { started = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const { request } = requestDetails(input, init);
      started();
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const checkout = t.action(api.whop.createPotCheckout, { potId, userId });
    await fetchStarted;
    expect(timeout).toHaveBeenCalledWith(8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await checkout).toEqual({ checkoutId: `fallback_checkout_${potId}_${userId}`, checkoutUrl: null, mode: "fallback" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("Whop webhook", () => {
  it("authenticates, funds once, and announces a payment", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { potId, userId, membershipId } = await fixture(t);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, request } = requestDetails(input, init);
      expect(url.pathname).toMatch(/\/messages$/);
      const payload = await request.json();
      expect(payload).toMatchObject({ channel_id: "feed_test" });
      expect(payload.content).toContain("10");
      return json({ id: "post_live" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ type: "payment.succeeded", account_id: "biz_test", data: {
      id: "pay_123", currency: "usd", total: { amount: "10.00", currency: "usd" },
      metadata: { potId, userId }, checkout_configuration: { id: "checkout_123" },
    } });
    const headers = await signedHeaders(body);
    const response = await t.fetch("/webhooks/whop", { method: "POST", headers, body });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, funded: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await t.run(async (ctx) => ctx.db.get(membershipId))).toMatchObject({
      stakeStatus: "funded", whopPaymentId: "pay_123", whopCheckoutId: "checkout_123",
    });
    expect(await t.run(async (ctx) => ctx.db.get(potId))).toMatchObject({ potTotalCents: 1000 });
    const duplicate = await t.fetch("/webhooks/whop", { method: "POST", headers, body });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ received: true, duplicate: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await t.run(async (ctx) => ctx.db.get(potId))).toMatchObject({ potTotalCents: 1000 });
    expect(await t.run(async (ctx) => ctx.db.query("webhookEvents").collect())).toHaveLength(1);
    const replayHeaders = await signedHeaders(body, "evt_replay");
    const replay = await t.fetch("/webhooks/whop", { method: "POST", headers: replayHeaders, body });
    expect(await replay.json()).toMatchObject({ received: true, duplicate: true });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await t.run(async (ctx) => ctx.db.get(potId))).toMatchObject({ potTotalCents: 1000 });
  });

  it("rejects forged and stale signatures and fails closed without a secret", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId, membershipId } = await fixture(t);
    const body = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_bad", metadata: { potId, userId } } });
    const headers = await signedHeaders(body);
    const forged = await t.fetch("/webhooks/whop", { method: "POST", headers: { ...headers, "webhook-signature": "v1,YmFk" }, body });
    expect(forged.status).toBe(401);
    const staleHeaders = await signedHeaders(body, "evt_stale", Math.floor(Date.now() / 1000) - 600);
    const stale = await t.fetch("/webhooks/whop", { method: "POST", headers: staleHeaders, body });
    expect([400, 401]).toContain(stale.status);
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "");
    const missing = await t.fetch("/webhooks/whop", { method: "POST", headers, body });
    expect(missing.status).toBe(503);
    expect(await t.run(async (ctx) => ctx.db.get(membershipId))).toMatchObject({ stakeStatus: "pending_checkout" });
    expect(await t.run(async (ctx) => ctx.db.query("webhookEvents").collect())).toHaveLength(0);
  });

  it("ignores unrelated signed events and requires signature headers", async () => {
    const t = convexTest(schema, modules);
    const body = JSON.stringify({ type: "membership.created", data: { id: "mem_123" } });
    const ignored = await t.fetch("/webhooks/whop", { method: "POST", headers: await signedHeaders(body), body });
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toMatchObject({ received: true, ignored: true, type: "membership.created" });
    const missingHeaders = await t.fetch("/webhooks/whop", { method: "POST", body });
    expect([400, 401]).toContain(missingHeaders.status);
  });

  it("rejects a signed payment that does not cover the stake before tax", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId, membershipId } = await fixture(t);
    const body = JSON.stringify({ type: "payment.succeeded", account_id: "biz_test", data: {
      id: "pay_short", currency: "usd", total: { amount: "10.00", currency: "usd" },
      tax_amount: { amount: "1.00", currency: "usd" }, metadata: { potId, userId },
    } });
    const response = await t.fetch("/webhooks/whop", { method: "POST", headers: await signedHeaders(body), body });
    expect(response.status).toBe(400);
    expect(await t.run(async (ctx) => ctx.db.get(membershipId))).toMatchObject({ stakeStatus: "pending_checkout" });
    expect(await t.run(async (ctx) => ctx.db.get(potId))).toMatchObject({ potTotalCents: 0 });
    expect(await t.run(async (ctx) => ctx.db.query("webhookEvents").collect())).toHaveLength(0);
  });

  it("accepts the payment alias and checkout configuration metadata", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { potId, userId, membershipId } = await fixture(t);
    vi.stubEnv("WHOP_API_KEY", "");
    const body = JSON.stringify({ type: "payment_succeeded", account_id: "biz_test", data: {
      id: "pay_alias", currency: "usd", total: { amount: "10.00", currency: "usd" },
      checkout_configuration: { id: "checkout_alias", metadata: { potId, userId } },
    } });
    const response = await t.fetch("/webhooks/whop", { method: "POST", headers: await signedHeaders(body), body });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, funded: true });
    expect(await t.run(async (ctx) => ctx.db.get(membershipId))).toMatchObject({
      stakeStatus: "funded", whopPaymentId: "pay_alias", whopCheckoutId: "checkout_alias",
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  });
});

describe("Whop transfers and chat", () => {
  it("records live transfers and falls back independently for failed and demo recipients", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await fixture(t);
    const [failedId, demoId] = await t.run(async (ctx) => Promise.all([
      ctx.db.insert("users", { name: "Bee", handle: "bee", whopUserId: "user_failed", simulatedWalletBalanceCents: 0, createdAt: Date.now() }),
      ctx.db.insert("users", { name: "Dee", handle: "dee", whopUserId: "demo_whop_user", simulatedWalletBalanceCents: 0, createdAt: Date.now() }),
    ]));
    const settlementEventId = await t.run(async (ctx) => ctx.db.insert("settlementEvents", {
      potId, triggeredBy: "demo", totalPotCents: 3000, forfeitedPoolCents: 0,
      winnerUserIds: [userId, failedId, demoId], loserUserIds: [], perWinnerPayoutCents: 1000, remainderCents: 0,
      transfers: [
        { userId, whopUserId: "user_real", amountCents: 1000, status: "pending", mode: "fallback" },
        { userId: failedId, whopUserId: "user_failed", amountCents: 1000, status: "pending", mode: "fallback" },
        { userId: demoId, whopUserId: "demo_whop_user", amountCents: 1000, status: "pending", mode: "fallback" },
      ], summaryMessage: "Settled", createdAt: Date.now(),
    }));
    const requests: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, request } = requestDetails(input, init);
      expect(url.pathname).toMatch(/\/transfers$/);
      const payload = await request.json();
      requests.push(payload);
      if (JSON.stringify(payload).includes("user_failed")) throw new Error("sandbox unavailable");
      return json({ id: "transfer_live", status: "succeeded", object: "transfer" });
    }));
    await t.action(internal.whop.executePotTransfers, { settlementEventId });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ type: "balance", origin_id: "biz_test", destination_id: "user_real", amount: 10, currency: "usd", idempotence_key: `settle_${settlementEventId}_${userId}` });
    expect(await t.run(async (ctx) => ctx.db.get(settlementEventId))).toMatchObject({ transfers: [
      { userId, status: "completed", mode: "live", whopTransferId: "transfer_live" },
      { userId: failedId, status: "fallback", mode: "fallback", whopTransferId: `fallback_transfer_${settlementEventId}_${failedId}` },
      { userId: demoId, status: "fallback", mode: "fallback", whopTransferId: `fallback_transfer_${settlementEventId}_${demoId}` },
    ] });
    await t.action(internal.whop.executePotTransfers, { settlementEventId });
    expect(requests).toHaveLength(2);
  });

  it("posts live messages and uses a deterministic fallback for demo channels", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await fixture(t);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, request } = requestDetails(input, init);
      expect(url.pathname).toMatch(/\/messages$/);
      expect(await request.json()).toMatchObject({ channel_id: "feed_test", content: "Alex joined" });
      return json({ id: "post_123" });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await t.action(internal.whop.postChatAnnouncement, { potId, message: "Alex joined" })).toEqual({ postId: "post_123", mode: "live" });
    await t.run(async (ctx) => ctx.db.patch(potId, { whopChatChannelId: "demo_whop_chat" }));
    const first = await t.action(internal.whop.postChatAnnouncement, { potId, message: "Alex joined" });
    expect(first).toMatchObject({ mode: "fallback", postId: expect.stringMatching(new RegExp(`^fallback_chat_${potId}_`)) });
    expect(await t.action(internal.whop.postChatAnnouncement, { potId, message: "Alex joined" })).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps processing transfers pending for later reconciliation", async () => {
    const t = convexTest(schema, modules);
    const { potId, userId } = await fixture(t);
    const settlementEventId = await t.run(async (ctx) => ctx.db.insert("settlementEvents", {
      potId, triggeredBy: "demo", totalPotCents: 1000, forfeitedPoolCents: 0,
      winnerUserIds: [userId], loserUserIds: [], perWinnerPayoutCents: 1000, remainderCents: 0,
      transfers: [{ userId, whopUserId: "user_real", amountCents: 1000, status: "pending", mode: "fallback" }],
      summaryMessage: "Settled", createdAt: Date.now(),
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: "transfer_pending", object: "transfer", status: "processing" })));
    await t.action(internal.whop.executePotTransfers, { settlementEventId });
    expect(await t.run(async (ctx) => ctx.db.get(settlementEventId))).toMatchObject({
      transfers: [{ userId, status: "pending" }],
    });
  });
});

describe("Whop client URLs", () => {
  it("accepts only HTTPS Whop checkout hosts without credentials or ports", () => {
    expect(buildCheckoutUrl("https://whop.com/checkout/abc")).toBe("https://whop.com/checkout/abc");
    expect(buildCheckoutUrl("https://checkout.whop.com/abc")).toBe("https://checkout.whop.com/abc");
    for (const value of [null, "", "http://whop.com/checkout", "https://whop.com.evil.test/", "https://whop.com@evil.test/", "https://user@whop.com/", "https://whop.com:444/", "not a url"]) {
      expect(buildCheckoutUrl(value)).toBeNull();
    }
  });

  it("builds experience links only for real experience identifiers", () => {
    expect(buildEmbeddedChatUrl("exp_ABC123")).toBe("https://whop.com/experiences/exp_ABC123/");
    for (const value of ["", "demo_whop_chat", "exp_../evil", "https://evil.test/"]) {
      expect(buildEmbeddedChatUrl(value)).toBeNull();
    }
  });
});
