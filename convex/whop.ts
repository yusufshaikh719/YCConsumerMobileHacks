import { v } from "convex/values";
import { WhopClient, WhopEnvironment } from "@whop/sdk";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalQuery } from "./_generated/server";

export const createPremiumCheckout = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ purchase_url: string | null; mode: "live" | "fallback" }> => {
    const token = process.env.WHOP_API_KEY;
    if (!token) return { purchase_url: null, mode: "fallback" };
    const client = new WhopClient({
      token,
      environment: process.env.WHOP_ENVIRONMENT === "production" ? WhopEnvironment.Production : WhopEnvironment.Sandbox,
      timeoutInSeconds: 8,
      maxRetries: 0,
    });
    const purchaseId = await ctx.runMutation(internal.premium.startPurchase, { userId });
    let checkout;
    try {
      checkout = await client.checkoutConfigurations.create({
        variant: { title: "Ante Premium", billing_type: "one_time", initial_price: 10, currency: "usd" },
        metadata: { userId, purchaseId, purpose: "premium" },
      });
    } catch {
      return { purchase_url: null, mode: "fallback" };
    }
    if (!checkout.purchase_url) return { purchase_url: null, mode: "fallback" };
    await ctx.runMutation(internal.premium.attachCheckout, { purchaseId, whopCheckoutId: checkout.id });
    return { purchase_url: checkout.purchase_url, mode: "live" };
  },
});

async function whopPost(path: string, body: object, apiKey: string): Promise<Record<string, unknown>> {
  const baseUrl = process.env.WHOP_ENVIRONMENT === "production" ? "https://api.whop.com" : "https://sandbox-api.whop.com";
  const response = await fetch(`${baseUrl}/api/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Api-Version-Date": "2026-11-13-1" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Whop API returned ${response.status}`);
  return await response.json() as Record<string, unknown>;
}

export const getCheckoutContext = internalQuery({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }): Promise<{ pot: Doc<"pots"> | null; user: Doc<"users"> | null }> => ({
    pot: await ctx.db.get(potId), user: await ctx.db.get(userId),
  }),
});

export const getPotForChat = internalQuery({
  args: { potId: v.id("pots") },
  handler: async (ctx, { potId }): Promise<Doc<"pots"> | null> => await ctx.db.get(potId),
});

export const getWebhookContext = internalQuery({
  args: { potId: v.string(), userId: v.string() },
  handler: async (ctx, args): Promise<{ potId: Id<"pots">; userId: Id<"users">; pot: Doc<"pots"> } | null> => {
    const potId = ctx.db.normalizeId("pots", args.potId);
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!potId || !userId) return null;
    const pot = await ctx.db.get(potId);
    return pot ? { potId, userId, pot } : null;
  },
});

export const createPotCheckout = action({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }): Promise<{ checkoutId: string; checkoutUrl: string | null; mode: "live" | "fallback" }> => {
    const { pot, user } = await ctx.runQuery(internal.whop.getCheckoutContext, { potId, userId });
    if (!pot) throw new Error("Pot not found");
    if (!user) throw new Error("User not found");
    const fallback = { checkoutId: `fallback_checkout_${potId}_${userId}`, checkoutUrl: null, mode: "fallback" as const };
    const apiKey = process.env.WHOP_API_KEY;
    const companyId = process.env.WHOP_COMPANY_ID;
    const productId = pot.whopProductId || process.env.WHOP_DEFAULT_PRODUCT_ID;
    if (!apiKey || !companyId || companyId.startsWith("demo_whop_") || user.whopUserId?.startsWith("demo_whop_") || productId?.startsWith("demo_whop_")) {
      console.warn("Whop checkout is not configured for live use; using fallback");
      return fallback;
    }
    try {
      const result = await whopPost("checkout_configurations", {
        account_id: companyId, mode: "payment",
        variant: { billing_type: "one_time", currency: "usd", initial_price: pot.stakeCents / 100, ...(productId ? { product_id: productId } : {}) },
        metadata: { potId, userId, potTitle: pot.title, habitCategory: pot.habitCategory },
      }, apiKey);
      if (typeof result.id !== "string" || !result.id) throw new Error("Missing checkout ID");
      return { checkoutId: result.id, checkoutUrl: typeof result.purchase_url === "string" ? result.purchase_url : null, mode: "live" };
    } catch {
      console.warn("Whop checkout unavailable; using fallback");
      return fallback;
    }
  },
});

export const getSettlementForTransfers = internalQuery({
  args: { settlementEventId: v.id("settlementEvents") },
  handler: async (ctx, { settlementEventId }): Promise<Doc<"settlementEvents"> | null> => await ctx.db.get(settlementEventId),
});

export const executePotTransfers = internalAction({
  args: { settlementEventId: v.id("settlementEvents") },
  handler: async (ctx, { settlementEventId }): Promise<void> => {
    const settlement = await ctx.runQuery(internal.whop.getSettlementForTransfers, { settlementEventId });
    if (!settlement) return;
    for (const transfer of settlement.transfers) {
      if (transfer.status !== "pending") continue;
      const apiKey = process.env.WHOP_API_KEY;
      const companyId = process.env.WHOP_COMPANY_ID;
      let result: { whopTransferId: string; status: "completed" | "fallback"; mode: "live" | "fallback" } = {
        whopTransferId: `fallback_transfer_${settlementEventId}_${transfer.userId}`, status: "fallback", mode: "fallback",
      };
      let processingId: string | undefined;
      if (apiKey && companyId && !companyId.startsWith("demo_whop_") && transfer.whopUserId && !transfer.whopUserId.startsWith("demo_whop_")) {
        try {
          const response = await whopPost("transfers", {
            type: "balance", origin_id: companyId, destination_id: transfer.whopUserId,
            amount: transfer.amountCents / 100, currency: "usd",
            idempotence_key: `settle_${settlementEventId}_${transfer.userId}`, notes: `Pot settlement ${settlementEventId}`,
          }, apiKey);
          if (typeof response.id !== "string" || !response.id) throw new Error("Missing transfer ID");
          if (response.status === "processing") {
            processingId = response.id;
          } else {
            if (response.status !== "succeeded") throw new Error("Whop transfer did not succeed");
            result = { whopTransferId: response.id, status: "completed", mode: "live" };
          }
        } catch {
          console.warn("Whop transfer unavailable; using fallback");
        }
      }
      if (processingId) {
        await ctx.runMutation(internal.pots.recordTransferResult, {
          settlementEventId, userId: transfer.userId, whopTransferId: processingId, status: "pending", mode: "live",
        });
        console.warn("Whop transfer is processing; leaving it pending for reconciliation");
        continue;
      }
      await ctx.runMutation(internal.pots.recordTransferResult, { settlementEventId, userId: transfer.userId, ...result });
    }
  },
});

export const postChatAnnouncement = internalAction({
  args: { potId: v.id("pots"), message: v.string() },
  handler: async (ctx, { potId, message }): Promise<{ postId: string; mode: "live" | "fallback" }> => {
    const pot = await ctx.runQuery(internal.whop.getPotForChat, { potId });
    const channelId = pot?.whopChatChannelId || process.env.EXPO_PUBLIC_WHOP_EMBEDDED_CHAT_CHANNEL_ID;
    const apiKey = process.env.WHOP_API_KEY;
    if (apiKey && channelId && !channelId.startsWith("demo_whop_")) {
      try {
        const result = await whopPost("messages", { channel_id: channelId, content: message }, apiKey);
        if (typeof result.id !== "string" || !result.id) throw new Error("Missing message ID");
        return { postId: result.id, mode: "live" };
      } catch {
        console.warn("Whop chat unavailable; using fallback");
      }
    }
    let hash = 0;
    for (const char of message) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    return { postId: `fallback_chat_${potId}_${hash}`, mode: "fallback" };
  },
});
