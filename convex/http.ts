import { httpRouter } from "convex/server";
import { unwrapWebhook } from "@whop/sdk/helpers";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/whop",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const key = process.env.WHOP_WEBHOOK_SECRET;
    if (!key) return json({ error: "Webhook secret is not configured" }, 503);
    let event: Record<string, unknown>;
    try {
      event = unwrapWebhook<Record<string, unknown>>(await request.text(), {
        headers: Object.fromEntries(request.headers), key,
      });
    } catch {
      return json({ error: "Invalid webhook" }, 401);
    }
    if (!object(event) || typeof event.type !== "string") return json({ error: "Invalid event" }, 400);
    if (event.type !== "payment.succeeded") return json({ received: true, ignored: true });
    const data = object(event.data);
    const metadata = object(data?.metadata);
    if (metadata?.purpose !== "premium") return json({ received: true, ignored: true });
    const eventId = request.headers.get("webhook-id");
    const total = usdCents(data?.total);
    const tax = data?.tax_amount == null ? 0 : usdCents(data.tax_amount);
    if (!nonemptyString(eventId) || !nonemptyString(data?.id) || !nonemptyString(data?.checkout_configuration_id) ||
        !nonemptyString(metadata.userId) || !nonemptyString(metadata.purchaseId) ||
        data.currency !== "usd" || total === null || tax === null || total - tax < 1000) {
      return json({ error: "Invalid premium payment" }, 400);
    }
    const result = await ctx.runMutation(internal.premium.fulfillPurchase, {
      userId: metadata.userId, purchaseId: metadata.purchaseId, whopCheckoutId: data.checkout_configuration_id, whopPaymentId: data.id, eventId,
    });
    if (result === "invalid") return json({ error: "Invalid premium purchase" }, 400);
    return json({ received: true, premium: true, duplicate: result === "duplicate" });
  }),
});

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function usdCents(value: unknown): number | null {
  const money = object(value);
  if (money?.currency !== "usd" || typeof money.amount !== "string") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(money.amount);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function verifySignature(secret: string, id: string, timestamp: string, signature: string, body: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const encoder = new TextEncoder();
  const keys = [encoder.encode(secret)];
  if (secret.startsWith("whsec_")) {
    const standardKey = decodeBase64(secret.slice(6));
    if (standardKey?.length) keys.push(standardKey);
  }
  const signatures = signature.split(/\s+/).flatMap(part => {
    const [version, value, extra] = part.split(",");
    const bytes = version === "v1" && value && !extra ? decodeBase64(value) : null;
    return bytes?.length === 32 ? [bytes] : [];
  });
  const prefix = encoder.encode(`${id}.${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  for (const bytes of keys) {
    const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const candidate of signatures) {
      if (await crypto.subtle.verify("HMAC", key, candidate, signed)) return true;
    }
  }
  return false;
}

http.route({
  path: "/webhooks/whop",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    if (!secret) return json({ error: "Webhook secret is not configured" }, 503);

    const id = request.headers.get("webhook-id");
    const timestamp = request.headers.get("webhook-timestamp");
    const signature = request.headers.get("webhook-signature");
    if (!id || !timestamp || !signature) return json({ error: "Missing webhook headers" }, 400);
    const seconds = Number(timestamp);
    if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) {
      return json({ error: "Invalid webhook timestamp" }, 401);
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (!await verifySignature(secret, id, timestamp, signature, body)) return json({ error: "Invalid webhook signature" }, 401);

    let event: Record<string, unknown> | null;
    try {
      event = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
    } catch {
      return json({ error: "Invalid webhook JSON" }, 400);
    }
    if (!event || !nonemptyString(event.type)) return json({ error: "Invalid webhook event" }, 400);
    if (event.type !== "payment.succeeded" && event.type !== "payment_succeeded") {
      return json({ received: true, ignored: true, type: event.type });
    }

    const data = object(event.data);
    const checkout = object(data?.checkout_configuration);
    const metadata = object(data?.metadata);
    const checkoutMetadata = object(checkout?.metadata);
    const potId = metadata?.potId ?? checkoutMetadata?.potId;
    const userId = metadata?.userId ?? checkoutMetadata?.userId;
    const whopPaymentId = data?.id;
    const whopCheckoutId = data?.checkout_configuration_id ?? checkout?.id;
    if (!nonemptyString(potId) || !nonemptyString(userId) || !nonemptyString(whopPaymentId) ||
        (whopCheckoutId != null && !nonemptyString(whopCheckoutId))) {
      return json({ error: "Invalid payment data" }, 400);
    }

    const context = await ctx.runQuery(internal.whop.getWebhookContext, { potId, userId });
    if (!context) return json({ error: "Invalid payment metadata" }, 400);
    const totalCents = usdCents(data?.total);
    const taxCents = data?.tax_amount == null ? 0 : usdCents(data.tax_amount);
    const companyId = process.env.WHOP_COMPANY_ID;
    const accountIds = [event.account_id, event.company_id, data?.account_id, data?.company_id].filter(value => value != null);
    if (companyId && (accountIds.length === 0 || accountIds.some(value => value !== companyId))) {
      return json({ error: "Payment account does not match" }, 400);
    }
    if (data?.currency !== "usd" || totalCents === null || taxCents === null || totalCents - taxCents < context.pot.stakeCents) {
      return json({ error: "Payment does not cover the USD stake" }, 400);
    }
    const funded = await ctx.runMutation(internal.pots.confirmWhopStake, {
      potId: context.potId,
      userId: context.userId,
      whopPaymentId,
      eventId: id,
      mode: "live",
      ...(typeof whopCheckoutId === "string" ? { whopCheckoutId } : {}),
    });
    if (!funded) return json({ received: true, duplicate: true });
    await ctx.scheduler.runAfter(0, internal.whop.postChatAnnouncement, {
      potId: context.potId,
      message: `A player just joined the pot with a $${(context.pot.stakeCents / 100).toFixed(2)} buy-in!`,
    });
    return json({ received: true, funded: true });
  }),
});

export default http;
