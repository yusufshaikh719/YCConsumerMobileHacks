import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { ANTE_REACTIONS, ANTE_STAKE_CENTS, DAY_MS, WEEK_MS, landmark } from "./lib/contracts";
import { assessLandmarkPhoto, type LiveResult } from "./mapReferee";
import { joinPendingCheckout, uniqueInviteCode } from "./pots";
import { haversineMeters } from "./sidequests";

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const SELFIE_REJECT_CONFIDENCE = 0.8;

async function userFor(ctx: QueryCtx, deviceId: string) {
  return await ctx.db.query("users").withIndex("by_device", q => q.eq("deviceId", deviceId)).unique();
}

async function requireUser(ctx: QueryCtx, deviceId: string) {
  const user = await userFor(ctx, deviceId);
  if (!user) throw new Error("Unknown device");
  return user;
}

async function membershipFor(ctx: QueryCtx, potId: Id<"pots">, userId: Id<"users">) {
  return await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", potId).eq("userId", userId)).unique();
}

export function whopPaymentsMode(): "sandbox" | "production" | "unavailable" {
  if (!process.env.WHOP_API_KEY || !process.env.WHOP_COMPANY_ID) return "unavailable";
  return process.env.WHOP_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export const ensureUser = mutation({
  args: { deviceId: v.string(), name: v.string() },
  handler: async (ctx, { deviceId, name }) => {
    if (!DEVICE_ID.test(deviceId)) throw new Error("Invalid device id");
    const clean = name.trim().slice(0, 40) || "Player";
    const existing = await userFor(ctx, deviceId);
    if (existing) {
      if (existing.name !== clean) await ctx.db.patch(existing._id, { name: clean });
      return existing._id;
    }
    return await ctx.db.insert("users", { name: clean, handle: `device_${deviceId.toLowerCase()}`, deviceId, simulatedWalletBalanceCents: 0, createdAt: Date.now() });
  },
});

export const createGroup = mutation({
  args: { deviceId: v.string(), name: v.string(), weekEndsAt: v.number() },
  handler: async (ctx, { deviceId, name, weekEndsAt }) => {
    const user = await requireUser(ctx, deviceId);
    const now = Date.now();
    if (!Number.isFinite(weekEndsAt) || weekEndsAt <= now || weekEndsAt > now + WEEK_MS + DAY_MS) throw new Error("Invalid week end");
    const title = name.trim().slice(0, 40) || `${user.name.split(/\s+/)[0]}'s group`;
    const inviteCode = await uniqueInviteCode(ctx);
    const potId = await ctx.db.insert("pots", {
      title, habitCategory: "custom", habitPrompt: "Walk to a nearby landmark.", stakeCents: ANTE_STAKE_CENTS, status: "open",
      roastPersona: "drill_sergeant", currentDayIndex: 1, dailyCutoffHourUtc: 0, nextDeadlineAt: weekEndsAt, potTotalCents: 0,
      forfeitedCents: 0, createdByUserId: user._id, createdAt: now, challengeMode: "ante_weekly", inviteCode, invitedHandles: [],
    });
    await joinPendingCheckout(ctx, potId, user._id);
    return { potId, inviteCode };
  },
});

export const joinGroup = mutation({
  args: { deviceId: v.string(), inviteCode: v.string() },
  handler: async (ctx, { deviceId, inviteCode }) => {
    const user = await requireUser(ctx, deviceId);
    const code = inviteCode.trim().toUpperCase();
    const pot = await ctx.db.query("pots").withIndex("by_invite_code", q => q.eq("inviteCode", code)).unique();
    if (!pot || pot.challengeMode !== "ante_weekly") return null;
    await joinPendingCheckout(ctx, pot._id, user._id);
    return { potId: pot._id, inviteCode: code };
  },
});

export const startQuest = mutation({
  args: { deviceId: v.string(), potId: v.id("pots"), landmark, originLat: v.number(), originLng: v.number(), pingAt: v.number(), revealAt: v.number(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.deviceId);
    const pot = await ctx.db.get(args.potId);
    if (!pot || pot.challengeMode !== "ante_weekly" || !await membershipFor(ctx, pot._id, user._id)) throw new Error("Not a member of this group");
    const now = Date.now();
    if (!(args.revealAt >= args.pingAt && args.expiresAt > args.revealAt && args.expiresAt - args.revealAt <= 60 * 60_000 && args.expiresAt > now && args.revealAt <= now + 10 * 60_000)) {
      throw new Error("Invalid sidequest window");
    }
    const distanceMeters = haversineMeters(args.originLat, args.originLng, args.landmark.lat, args.landmark.lng);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 200 || distanceMeters > 3000 || args.landmark.radiusMeters < 20 || args.landmark.radiusMeters > 150) {
      throw new Error("Landmark is not a real walk away");
    }
    const sameDay = await ctx.db.query("sidequests").withIndex("by_pot_user_day", q => q.eq("potId", pot._id).eq("userId", user._id).eq("dayIndex", pot.currentDayIndex)).collect();
    const existing = sameDay.find(quest => quest.warningSentAt === args.pingAt && quest.anteLandmark?.id === args.landmark.id);
    if (existing) return existing._id;
    return await ctx.db.insert("sidequests", {
      potId: pot._id, userId: user._id, dayIndex: pot.currentDayIndex, status: "active", title: `Walk to ${args.landmark.name}`,
      instruction: args.landmark.trivia || `Walk to ${args.landmark.name}.`, originLat: args.originLat, originLng: args.originLng,
      destName: args.landmark.name, destLat: args.landmark.lat, destLng: args.landmark.lng, destSummary: args.landmark.trivia,
      destSource: args.landmark.source === "Wikipedia" ? "wikipedia" : "openstreetmap", ...(args.landmark.url ? { destUrl: args.landmark.url } : {}),
      distanceMeters: Math.round(distanceMeters), allottedMinutes: Math.round((args.expiresAt - args.revealAt) / 60_000),
      targetRadiusMeters: args.landmark.radiusMeters, warningSentAt: args.pingAt, startsAt: args.revealAt, expiresAt: args.expiresAt, anteLandmark: args.landmark,
    });
  },
});

type Arrival = { ok: true; stampId: Id<"stamps">; verifiedBy: "photo_ai" | "gps_only"; note?: string } | { ok: false; reason: "expired" | "outside_geofence" | "not_active" | "photo_rejected"; distanceMeters?: number; note?: string };
const verification = v.object({ mode: v.union(v.literal("photo_ai"), v.literal("gps_only")), confidence: v.optional(v.number()), note: v.optional(v.string()) });

export const checkArrival = internalMutation({
  args: { deviceId: v.string(), sidequestId: v.id("sidequests"), lat: v.number(), lng: v.number(), accuracy: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Arrival | { ok: "check"; userId: Id<"users">; distanceMeters: number; destName: string; destSummary: string; radiusMeters: number }> => {
    const user = await requireUser(ctx, args.deviceId);
    const quest = await ctx.db.get(args.sidequestId);
    if (!quest || quest.userId !== user._id || !quest.anteLandmark) throw new Error("Sidequest not found");
    const stamped = await ctx.db.query("stamps").withIndex("by_sidequest", q => q.eq("sidequestId", quest._id)).unique();
    if (stamped) return { ok: true, stampId: stamped._id, verifiedBy: stamped.verification?.mode ?? "gps_only" };
    if (quest.status !== "active") return { ok: false, reason: "not_active" };
    if (Date.now() > quest.expiresAt + 2 * 60_000) {
      await ctx.db.patch(quest._id, { status: "failed_timeout" });
      return { ok: false, reason: "expired" };
    }
    if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng) || Math.abs(args.lat) > 90 || Math.abs(args.lng) > 180) throw new Error("Invalid position");
    const radius = quest.targetRadiusMeters;
    const accuracy = Math.min(500, Math.max(0, args.accuracy ?? 0));
    const distanceMeters = haversineMeters(args.lat, args.lng, quest.destLat, quest.destLng);
    if (distanceMeters > radius * Math.max(1.5, 1 + Math.min(1, accuracy / radius))) return { ok: false, reason: "outside_geofence", distanceMeters: Math.round(distanceMeters) };
    return { ok: "check", userId: user._id, distanceMeters: Math.round(distanceMeters), destName: quest.destName, destSummary: quest.destSummary, radiusMeters: radius };
  },
});

export const recordArrival = internalMutation({
  args: { userId: v.id("users"), sidequestId: v.id("sidequests"), distanceMeters: v.number(), photoStorageId: v.optional(v.id("_storage")), verification },
  handler: async (ctx, args): Promise<Id<"stamps">> => {
    const quest = await ctx.db.get(args.sidequestId);
    if (!quest || quest.userId !== args.userId || !quest.anteLandmark) throw new Error("Sidequest not found");
    const stamped = await ctx.db.query("stamps").withIndex("by_sidequest", q => q.eq("sidequestId", quest._id)).unique();
    if (stamped) return stamped._id;
    const pot = await ctx.db.get(quest.potId);
    if (!pot || !await membershipFor(ctx, pot._id, args.userId)) throw new Error("Not a member of this group");
    const completedAt = Math.min(Date.now(), quest.expiresAt);
    const stampId = await ctx.db.insert("stamps", {
      potId: pot._id, userId: args.userId, sidequestId: quest._id, weekEndsAt: pot.nextDeadlineAt, landmark: quest.anteLandmark,
      ...(args.photoStorageId ? { photoStorageId: args.photoStorageId } : {}), distanceMeters: args.distanceMeters, completedAt,
      minutesTaken: Math.max(1, Math.round((completedAt - quest.startsAt) / 60_000)), verification: args.verification,
    });
    await ctx.db.patch(quest._id, { status: "completed", completedAt });
    return stampId;
  },
});

export const getPhotoUrl = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => await ctx.storage.getUrl(storageId),
});

export const submitArrival = action({
  args: { deviceId: v.string(), sidequestId: v.id("sidequests"), lat: v.number(), lng: v.number(), accuracy: v.optional(v.number()), photoStorageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { photoStorageId, ...position }): Promise<Arrival> => {
    const check = await ctx.runMutation(internal.ante.checkArrival, position);
    if (check.ok !== "check") return check;
    const imageUrl = photoStorageId ? await ctx.runQuery(internal.ante.getPhotoUrl, { storageId: photoStorageId }) : null;
    let live: LiveResult | null = null;
    if (imageUrl && (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)) {
      const prompt = `This is an arrival selfie for a walking sidequest to ${check.destName}. About the place: ${check.destSummary || "no description"}. GPS has already confirmed the player is ${check.distanceMeters}m from it (target radius ${check.radiusMeters}m), so assume they really are there. Your only job is to catch obvious cheating, not to recognize the place. The player's face may fill most of the frame and they may be outside or inside, so ${check.destName} itself often won't be identifiable, and that is fine. Set landmarkPassed to true whenever a person is in the photo and the background shows any real-world surroundings that could plausibly be at or inside ${check.destName}, such as a building exterior or interior, doors, windows, signage, a street or sidewalk, trees, an office, a lobby, furniture or other people. When in doubt, pass. Set landmarkPassed to false only when there is no person in the photo, when a blank featureless surface such as a plain wall fills the whole background with nothing else visible, or when the background is clearly a different kind of place, such as a beach, a bedroom when the place is outdoors, or a different famous landmark. Set visualSpoofDetected to true only when the image is a screenshot, a photo of a screen or a printed photo, obviously edited, or blank or almost entirely black. When either check fails, put one short, friendly reason addressed to the player in visualSpoofReasons, such as "No one's in the shot", "Show a bit more than a blank wall behind you" or "That looks like a beach, not ${check.destName}". Set confidence (0 to 1) to how sure you are of the problem you flagged, or of the pass when nothing is wrong. Return only JSON with landmarkPassed (boolean), visualSpoofDetected (boolean), visualSpoofReasons (array of short strings), confidence (0 to 1), and roastMessage (one short playful sentence about the photo).`;
      const signal = AbortSignal.timeout(12_000);
      try {
        live = await Promise.race([
          assessLandmarkPhoto(imageUrl, prompt, signal),
          new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Photo check timed out")), { once: true })),
        ]);
      } catch (error) {
        console.warn("Selfie check unavailable; recording a GPS-only verification", error instanceof Error ? error.message : error);
        live = null;
      }
    }
    const flagged = live !== null && (live.visualSpoofDetected || !live.landmarkPassed);
    const rejected = live !== null && flagged && live.confidence >= SELFIE_REJECT_CONFIDENCE;
    if (live) console.log("Selfie verdict", JSON.stringify({ sidequestId: position.sidequestId, destName: check.destName, landmarkPassed: live.landmarkPassed, visualSpoofDetected: live.visualSpoofDetected, reasons: live.visualSpoofReasons, confidence: live.confidence, rejected }));
    if (live && rejected) {
      return { ok: false, reason: "photo_rejected", note: (live.visualSpoofReasons.find(reason => reason.trim()) ?? "Show a bit more of where you are behind you.").trim().slice(0, 120) };
    }
    const note = live?.roastMessage.trim().slice(0, 200);
    const stampId = await ctx.runMutation(internal.ante.recordArrival, {
      userId: check.userId, sidequestId: position.sidequestId, distanceMeters: check.distanceMeters, ...(photoStorageId ? { photoStorageId } : {}),
      verification: live ? { mode: "photo_ai", confidence: Math.max(0, Math.min(1, flagged ? 1 - live.confidence : live.confidence)), ...(note ? { note } : {}) } : { mode: "gps_only" },
    });
    return { ok: true, stampId, verifiedBy: live ? "photo_ai" : "gps_only", ...(note ? { note } : {}) };
  },
});

export const react = mutation({
  args: { deviceId: v.string(), stampId: v.id("stamps"), reaction: v.string() },
  handler: async (ctx, { deviceId, stampId, reaction }) => {
    if (!ANTE_REACTIONS.includes(reaction)) throw new Error("Unknown reaction");
    const user = await requireUser(ctx, deviceId);
    const stamp = await ctx.db.get(stampId);
    if (!stamp || !await membershipFor(ctx, stamp.potId, user._id)) throw new Error("Not a member of this group");
    const mine = (await ctx.db.query("stampReactions").withIndex("by_stamp", q => q.eq("stampId", stampId)).collect()).find(r => r.userId === user._id && r.reaction === reaction);
    if (mine) await ctx.db.delete(mine._id);
    else await ctx.db.insert("stampReactions", { stampId, userId: user._id, reaction });
  },
});

export const getGroup = query({
  args: { deviceId: v.string(), potId: v.id("pots") },
  handler: async (ctx, { deviceId, potId }) => {
    const user = await userFor(ctx, deviceId);
    const pot = await ctx.db.get(potId);
    if (!user || !pot || pot.challengeMode !== "ante_weekly") return null;
    const memberships = await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect();
    if (!memberships.some(m => m.userId === user._id)) return null;
    const members = await Promise.all(memberships.sort((a, b) => a.joinedAt - b.joinedAt).map(async m => ({
      userId: m.userId, name: (await ctx.db.get(m.userId))?.name ?? "Player", stakeStatus: m.stakeStatus, joinedAt: m.joinedAt,
    })));
    const stampRows = await ctx.db.query("stamps").withIndex("by_pot_week", q => q.eq("potId", potId).eq("weekEndsAt", pot.nextDeadlineAt)).collect();
    const stamps = await Promise.all(stampRows.map(async stamp => ({
      id: stamp._id, userId: stamp.userId, landmark: stamp.landmark, completedAt: stamp.completedAt, minutesTaken: stamp.minutesTaken, verifiedBy: stamp.verification?.mode ?? "gps_only",
      photoUrl: stamp.photoStorageId ? await ctx.storage.getUrl(stamp.photoStorageId) : null,
      reactions: (await ctx.db.query("stampReactions").withIndex("by_stamp", q => q.eq("stampId", stamp._id)).collect()).map(r => ({ userId: r.userId, reaction: r.reaction })),
    })));
    const settlement = await ctx.db.query("settlementEvents").withIndex("by_pot", q => q.eq("potId", potId)).order("desc").first();
    const nameOf = (id: Id<"users">) => members.find(m => m.userId === id)?.name ?? "Player";
    return {
      potId, title: pot.title, inviteCode: pot.inviteCode ?? "", stakeCents: pot.stakeCents, potCents: pot.potTotalCents, status: pot.status,
      weekEndsAt: pot.nextDeadlineAt, createdBy: pot.createdByUserId, meId: user._id, members, stamps, payments: whopPaymentsMode(),
      lastSettlement: settlement ? {
        at: settlement.createdAt, totalPotCents: settlement.totalPotCents, perWinnerCents: settlement.perWinnerPayoutCents,
        winners: settlement.winnerUserIds.map(nameOf),
        transfers: settlement.transfers.map(t => ({ name: nameOf(t.userId), amountCents: t.amountCents, status: t.status, mode: t.mode })),
      } : null,
    };
  },
});

export const settleWeek = internalMutation({
  args: { potId: v.id("pots"), triggeredBy: v.union(v.literal("cron"), v.literal("demo")), force: v.optional(v.boolean()) },
  handler: async (ctx, { potId, triggeredBy, force }) => {
    const pot = await ctx.db.get(potId);
    const now = Date.now();
    if (!pot || pot.challengeMode !== "ante_weekly" || (!force && now < pot.nextDeadlineAt)) return null;
    const members = (await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect()).sort((a, b) => a.joinedAt - b.joinedAt);
    const stamps = await ctx.db.query("stamps").withIndex("by_pot_week", q => q.eq("potId", potId).eq("weekEndsAt", pot.nextDeadlineAt)).collect();
    const funded = members.filter(m => m.stakeStatus === "funded");
    let settlementEventId: Id<"settlementEvents"> | null = null;
    if (funded.length && pot.potTotalCents > 0) {
      const count = (userId: Id<"users">) => stamps.filter(s => s.userId === userId).length;
      const best = Math.max(...funded.map(m => count(m.userId)));
      const winners = funded.filter(m => count(m.userId) === best);
      const perWinnerPayoutCents = Math.floor(pot.potTotalCents / winners.length);
      const remainderCents = pot.potTotalCents % winners.length;
      const transfers = [];
      for (const [index, winner] of winners.entries()) {
        const user = await ctx.db.get(winner.userId);
        if (!user) throw new Error("Winner not found");
        const amountCents = perWinnerPayoutCents + (index < remainderCents ? 1 : 0);
        await ctx.db.patch(user._id, { simulatedWalletBalanceCents: user.simulatedWalletBalanceCents + amountCents });
        await ctx.db.patch(winner._id, { payoutCents: amountCents });
        transfers.push({ userId: user._id, ...(user.whopUserId ? { whopUserId: user.whopUserId } : {}), amountCents, status: "pending" as const, mode: "fallback" as const });
      }
      const summaryMessage = best === 0
        ? `${pot.title}: nobody stamped this week, so ${winners.length} buy-ins were returned.`
        : `${pot.title}: ${winners.length} winner${winners.length === 1 ? "" : "s"} with ${best} stamp${best === 1 ? "" : "s"} split ${pot.potTotalCents} cents.`;
      settlementEventId = await ctx.db.insert("settlementEvents", {
        potId, triggeredBy, totalPotCents: pot.potTotalCents, forfeitedPoolCents: 0, winnerUserIds: winners.map(m => m.userId),
        loserUserIds: funded.filter(m => !winners.includes(m)).map(m => m.userId), perWinnerPayoutCents, remainderCents, transfers, summaryMessage, createdAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.whop.executePotTransfers, { settlementEventId });
    }
    let nextDeadlineAt = pot.nextDeadlineAt + WEEK_MS;
    while (nextDeadlineAt <= now) nextDeadlineAt += WEEK_MS;
    await ctx.db.patch(potId, { status: "open", potTotalCents: 0, forfeitedCents: 0, nextDeadlineAt });
    for (const member of members) await ctx.db.patch(member._id, { stakeStatus: "pending_checkout" });
    return settlementEventId;
  },
});
