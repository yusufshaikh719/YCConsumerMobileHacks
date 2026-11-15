import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { DEFAULT_STAKE_CENTS, habitCategory, nextCutoff, persona, transferMode, transferStatus } from "./lib/contracts";

export const createPot = mutation({
  args: { title: v.string(), habitCategory, habitPrompt: v.string(), createdByUserId: v.id("users"), stakeCents: v.optional(v.number()), dailyCutoffHourUtc: v.optional(v.number()), roastPersona: v.optional(persona) },
  handler: async (ctx, args) => {
    if (!await ctx.db.get(args.createdByUserId)) throw new Error("Creator not found");
    const stake = args.stakeCents ?? DEFAULT_STAKE_CENTS;
    const hour = args.dailyCutoffHourUtc ?? 7;
    if (!args.title.trim() || !args.habitPrompt.trim() || !Number.isSafeInteger(stake) || stake <= 0 || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Invalid pot details");
    const now = Date.now();
    return await ctx.db.insert("pots", { title: args.title.trim(), habitCategory: args.habitCategory, habitPrompt: args.habitPrompt.trim(), createdByUserId: args.createdByUserId, stakeCents: stake, dailyCutoffHourUtc: hour, roastPersona: args.roastPersona ?? "drill_sergeant", status: "open", currentDayIndex: 1, nextDeadlineAt: nextCutoff(now, hour), potTotalCents: 0, forfeitedCents: 0, createdAt: now });
  },
});

export const joinPotPendingCheckout = mutation({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }) => {
    const pot = await ctx.db.get(potId);
    if (!pot || (pot.status !== "open" && pot.status !== "active") || pot.currentDayIndex !== 1 || Date.now() >= pot.nextDeadlineAt) throw new Error("Pot is not accepting members");
    if (!await ctx.db.get(userId)) throw new Error("User not found");
    const existing = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("memberships", { potId, userId, stakeStatus: "pending_checkout", streakCount: 0, completedDays: [], missedDays: [], joinedAt: Date.now() });
  },
});

export const setPotPersona = mutation({ args: { potId: v.id("pots"), roastPersona: persona }, handler: async (ctx, { potId, roastPersona }) => { if (!await ctx.db.get(potId)) throw new Error("Pot not found"); await ctx.db.patch(potId, { roastPersona }); } });
export const listActivePots = query({ args: {}, handler: async ctx => (await Promise.all([ctx.db.query("pots").withIndex("by_status_deadline", q => q.eq("status", "open")).collect(), ctx.db.query("pots").withIndex("by_status_deadline", q => q.eq("status", "active")).collect()])).flat() });

export const getPotDashboard = query({
  args: { potId: v.id("pots") },
  handler: async (ctx, { potId }) => {
    const pot = await ctx.db.get(potId);
    if (!pot) return null;
    const memberships = await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect();
    const leaderboard = await Promise.all(memberships.map(async membership => ({ ...membership, user: await ctx.db.get(membership.userId), streakGrid: Array.from({ length: 7 }, (_, i) => membership.completedDays.includes(i + 1) ? "completed" : membership.missedDays.includes(i + 1) ? "missed" : "pending") })));
    leaderboard.sort((a, b) => b.completedDays.length - a.completedDays.length || a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
    const recentSubmissions = await ctx.db.query("submissions").withIndex("by_pot_day", q => q.eq("potId", potId)).order("desc").take(30);
    const latestSettlement = await ctx.db.query("settlementEvents").withIndex("by_pot", q => q.eq("potId", potId)).order("desc").first();
    const webhookEvents = await ctx.db.query("webhookEvents").withIndex("by_processed").order("desc").take(30);
    return { pot, leaderboard, recentSubmissions, latestSettlement, webhookEvents, transferEvents: latestSettlement?.transfers ?? [] };
  },
});

export const confirmWhopStake = internalMutation({
  args: { potId: v.id("pots"), userId: v.id("users"), whopPaymentId: v.string(), eventId: v.string(), mode: v.union(v.literal("live"), v.literal("simulated")), whopCheckoutId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const priorEvent = await ctx.db.query("webhookEvents").withIndex("by_event", q => q.eq("provider", "whop").eq("eventId", args.eventId)).unique();
    if (priorEvent) return false;
    const priorPayment = await ctx.db.query("memberships").withIndex("by_payment", q => q.eq("whopPaymentId", args.whopPaymentId)).unique();
    if (priorPayment) {
      if (priorPayment.potId !== args.potId || priorPayment.userId !== args.userId) throw new Error("Payment already used by another membership");
      await ctx.db.insert("webhookEvents", { provider: "whop", eventId: args.eventId, eventType: "payment.succeeded", payloadSummary: `pot=${args.potId} user=${args.userId} payment=${args.whopPaymentId}`, processedAt: Date.now(), mode: args.mode });
      return false;
    }
    const pot = await ctx.db.get(args.potId);
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", args.potId).eq("userId", args.userId)).unique();
    if (!pot || !member || member.stakeStatus !== "pending_checkout" || !["open", "active"].includes(pot.status) || pot.currentDayIndex !== 1 || Date.now() >= pot.nextDeadlineAt) throw new Error("Membership is not awaiting a valid checkout");
    await ctx.db.patch(member._id, { stakeStatus: "funded", whopPaymentId: args.whopPaymentId, whopCheckoutId: args.whopCheckoutId });
    await ctx.db.patch(pot._id, { status: "active", potTotalCents: pot.potTotalCents + pot.stakeCents });
    await ctx.db.insert("webhookEvents", { provider: "whop", eventId: args.eventId, eventType: "payment.succeeded", payloadSummary: `pot=${args.potId} user=${args.userId} payment=${args.whopPaymentId}`, processedAt: Date.now(), mode: args.mode });
    return true;
  },
});

export const recordTransferResult = internalMutation({
  args: { settlementEventId: v.id("settlementEvents"), userId: v.id("users"), whopTransferId: v.string(), status: transferStatus, mode: transferMode },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.settlementEventId);
    if (!event) throw new Error("Settlement not found");
    const transfer = event.transfers.find(t => t.userId === args.userId);
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "pending") return;
    await ctx.db.patch(event._id, { transfers: event.transfers.map(t => t.userId === args.userId ? { ...t, whopTransferId: args.whopTransferId, status: args.status, mode: args.mode } : t) });
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", event.potId).eq("userId", args.userId)).unique();
    if (member) await ctx.db.patch(member._id, { whopTransferId: args.whopTransferId });
  },
});
