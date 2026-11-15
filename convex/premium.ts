import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const getStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    return { isPremium: user.isPremium === true };
  },
});

export const startPurchase = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.isPremium) throw new Error("User is already premium");
    return await ctx.db.insert("premiumPurchases", { userId, createdAt: Date.now() });
  },
});

export const attachCheckout = internalMutation({
  args: { purchaseId: v.id("premiumPurchases"), whopCheckoutId: v.string() },
  handler: async (ctx, { purchaseId, whopCheckoutId }) => {
    await ctx.db.patch(purchaseId, { whopCheckoutId });
  },
});

export const fulfillPurchase = internalMutation({
  args: { purchaseId: v.string(), userId: v.string(), whopCheckoutId: v.string(), whopPaymentId: v.string(), eventId: v.string() },
  handler: async (ctx, args) => {
    const purchaseId = ctx.db.normalizeId("premiumPurchases", args.purchaseId);
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!purchaseId || !userId) return "invalid";
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase || purchase.userId !== userId || purchase.whopCheckoutId !== args.whopCheckoutId || !await ctx.db.get(userId)) return "invalid";
    if (purchase.whopPaymentId) {
      if (purchase.whopPaymentId !== args.whopPaymentId) return "invalid";
      return "duplicate";
    }
    const priorPayment = await ctx.db.query("premiumPurchases").withIndex("by_payment", q => q.eq("whopPaymentId", args.whopPaymentId)).unique();
    const priorEvent = await ctx.db.query("webhookEvents").withIndex("by_event", q => q.eq("provider", "whop").eq("eventId", args.eventId)).unique();
    if (priorPayment || priorEvent) return "invalid";
    await ctx.db.patch(purchaseId, { whopPaymentId: args.whopPaymentId });
    await ctx.db.patch(userId, { isPremium: true });
    await ctx.db.insert("webhookEvents", {
      provider: "whop", eventId: args.eventId, eventType: "payment.succeeded",
      payloadSummary: `premium user=${userId} payment=${args.whopPaymentId}`,
      processedAt: Date.now(), mode: "live",
    });
    return "fulfilled";
  },
});
