import { v } from "convex/values";
import { mutation, query, internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_STAKE_CENTS, habitCategory, nextCutoff, persona, transferMode, transferStatus } from "./lib/contracts";

const inviteUrl = (code: string) => `https://ante.app/join/${code}`;
const normalizeHandle = (handle: string) => handle.trim().replace(/^@/, "").toLowerCase();

export async function joinPendingCheckout(ctx: MutationCtx, potId: Id<"pots">, userId: Id<"users">) {
  const pot = await ctx.db.get(potId);
  if (!pot || (pot.status !== "open" && pot.status !== "active") || pot.currentDayIndex !== 1 || Date.now() >= pot.nextDeadlineAt) throw new Error("Pot is not accepting members");
  if (!await ctx.db.get(userId)) throw new Error("User not found");
  const existing = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique();
  if (existing) return existing._id;
  return await ctx.db.insert("memberships", { potId, userId, stakeStatus: "pending_checkout", streakCount: 0, completedDays: [], missedDays: [], joinedAt: Date.now() });
}

export async function uniqueInviteCode(ctx: MutationCtx) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
    if (!await ctx.db.query("pots").withIndex("by_invite_code", q => q.eq("inviteCode", candidate)).first()) return candidate;
  }
  throw new Error("Could not generate a unique invite code");
}

export const createPot = mutation({
  args: { title: v.string(), habitCategory, habitPrompt: v.string(), createdByUserId: v.id("users"), stakeCents: v.optional(v.number()), dailyCutoffHourUtc: v.optional(v.number()), roastPersona: v.optional(persona), challengeMode: v.optional(v.union(v.literal("sidequest"), v.literal("habit_photo"))), invitedHandles: v.optional(v.array(v.string())), invitedUserIds: v.optional(v.array(v.id("users"))) },
  handler: async (ctx, args) => {
    if (!await ctx.db.get(args.createdByUserId)) throw new Error("Creator not found");
    const stake = args.stakeCents ?? DEFAULT_STAKE_CENTS;
    const hour = args.dailyCutoffHourUtc ?? 7;
    if (!args.title.trim() || !args.habitPrompt.trim() || !Number.isSafeInteger(stake) || stake <= 0 || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Invalid pot details");
    const handles = [...new Set((args.invitedHandles ?? []).map(normalizeHandle))];
    if (handles.some(handle => !handle)) throw new Error("Invalid friend handle");
    const userIds = new Set(args.invitedUserIds ?? []);
    for (const userId of userIds) if (!await ctx.db.get(userId)) throw new Error("Invited user not found");
    const now = Date.now();
    for (const handle of handles) {
      const existing = await ctx.db.query("users").withIndex("by_handle", q => q.eq("handle", handle)).unique();
      userIds.add(existing?._id ?? await ctx.db.insert("users", { name: handle, handle, simulatedWalletBalanceCents: 0, createdAt: now }));
    }
    const inviteCode = await uniqueInviteCode(ctx);
    const potId = await ctx.db.insert("pots", { title: args.title.trim(), habitCategory: args.habitCategory, habitPrompt: args.habitPrompt.trim(), createdByUserId: args.createdByUserId, stakeCents: stake, dailyCutoffHourUtc: hour, roastPersona: args.roastPersona ?? "drill_sergeant", challengeMode: args.challengeMode ?? "sidequest", inviteCode, invitedHandles: handles, status: "open", currentDayIndex: 1, nextDeadlineAt: nextCutoff(now, hour), potTotalCents: 0, forfeitedCents: 0, createdAt: now });
    for (const userId of userIds) await joinPendingCheckout(ctx, potId, userId);
    return potId;
  },
});

export const joinPotPendingCheckout = mutation({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }) => {
    return await joinPendingCheckout(ctx, potId, userId);
  },
});

export const createOrGetFriend = mutation({
  args: { name: v.string(), handle: v.string() },
  handler: async (ctx, { name, handle }) => {
    const normalizedHandle = normalizeHandle(handle);
    if (!name.trim() || !normalizedHandle) throw new Error("Invalid friend details");
    const existing = await ctx.db.query("users").withIndex("by_handle", q => q.eq("handle", normalizedHandle)).unique();
    return existing?._id ?? await ctx.db.insert("users", { name: name.trim(), handle: normalizedHandle, simulatedWalletBalanceCents: 0, createdAt: Date.now() });
  },
});

export const getPotByInviteCode = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const code = inviteCode.trim().toUpperCase();
    const pot = await ctx.db.query("pots").withIndex("by_invite_code", q => q.eq("inviteCode", code)).unique();
    return pot ? { ...pot, inviteUrl: inviteUrl(code) } : null;
  },
});

export const joinPotByInviteCode = mutation({
  args: { inviteCode: v.string(), userId: v.id("users") },
  handler: async (ctx, { inviteCode, userId }) => {
    const code = inviteCode.trim().toUpperCase();
    const pot = await ctx.db.query("pots").withIndex("by_invite_code", q => q.eq("inviteCode", code)).unique();
    if (!pot) throw new Error("Invite code not found");
    const membershipId = await joinPendingCheckout(ctx, pot._id, userId);
    return { potId: pot._id, membershipId, inviteUrl: inviteUrl(code), stakeCents: pot.stakeCents };
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
  args: { potId: v.id("pots"), userId: v.id("users"), whopPaymentId: v.string(), eventId: v.string(), mode: v.union(v.literal("live"), v.literal("simulated")), whopCheckoutId: v.optional(v.string()), whopUserId: v.optional(v.string()) },
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
    const payer = await ctx.db.get(args.userId);
    if (args.whopUserId && payer && (!payer.whopUserId || payer.whopUserId.startsWith("demo_whop_"))) await ctx.db.patch(payer._id, { whopUserId: args.whopUserId });
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
