import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { DAY_MS, nextCutoff } from "./lib/contracts";
import { haversineMeters, walkingMinutes } from "./sidequests";

export const seedStageDemoPot = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const players = [
      { name: "Aahil", handle: "stage_demo_aahil", completedDays: [1, 2, 3, 4], missedDays: [], streakCount: 4 },
      { name: "Yusuf", handle: "stage_demo_yusuf", completedDays: [1, 2, 3, 4], missedDays: [], streakCount: 4 },
      { name: "Maya", handle: "stage_demo_maya", completedDays: [1, 2, 3], missedDays: [], streakCount: 3 },
      { name: "Leo", handle: "stage_demo_leo", completedDays: [1, 2], missedDays: [3], streakCount: 0 },
    ];
    const users = await Promise.all(players.map(async (player) => {
      const existing = await ctx.db.query("users").withIndex("by_handle", q => q.eq("handle", player.handle)).unique();
      const fields = { name: player.name, handle: player.handle, whopUserId: `demo_whop_user_${player.handle}`, whopWalletId: `demo_whop_wallet_${player.handle}`, simulatedWalletBalanceCents: 0 };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        return existing._id;
      }
      return await ctx.db.insert("users", { ...fields, createdAt: now });
    }));

    const existingPot = (await ctx.db.query("pots").collect()).find(pot => pot.whopProductId === "demo_whop_product_gym_pact" && pot.createdByUserId === users[0]);
    const potFields = {
      title: "7 AM Gym Iron Pact", habitCategory: "fitness" as const, habitPrompt: "Show up at the gym before 7 AM.",
      stakeCents: 1000, status: "active" as const, whopProductId: "demo_whop_product_gym_pact",
      whopCheckoutConfigId: "demo_whop_checkout_gym_pact", whopChatChannelId: "demo_whop_chat_gym_pact",
      roastPersona: "drill_sergeant" as const, currentDayIndex: 4, dailyCutoffHourUtc: 7,
      nextDeadlineAt: nextCutoff(now, 7), potTotalCents: 4000, forfeitedCents: 1000,
      createdByUserId: users[0], createdAt: now,
    };
    const potId = existingPot?._id ?? await ctx.db.insert("pots", potFields);
    if (existingPot) {
      await ctx.db.patch(potId, potFields);
      const memberships = await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect();
      const challenges = await ctx.db.query("challenges").withIndex("by_pot_user_day", q => q.eq("potId", potId)).collect();
      const submissions = await ctx.db.query("submissions").withIndex("by_pot_day", q => q.eq("potId", potId)).collect();
      const settlements = await ctx.db.query("settlementEvents").withIndex("by_pot", q => q.eq("potId", potId)).collect();
      for (const document of [...memberships, ...challenges, ...submissions, ...settlements]) await ctx.db.delete(document._id);
    }

    const eventPrefix = `demo_seed_${potId}_`;
    const webhookEvents = await ctx.db.query("webhookEvents").collect();
    for (const event of webhookEvents) if (event.eventId.startsWith(eventPrefix)) await ctx.db.delete(event._id);

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const userId = users[i];
      const paymentId = `demo_payment_${potId}_${i}`;
      await ctx.db.insert("memberships", {
        potId, userId, stakeStatus: i === 3 ? "forfeited" : "funded", whopCheckoutId: `demo_checkout_${potId}_${i}`,
        whopPaymentId: paymentId, streakCount: player.streakCount, completedDays: player.completedDays,
        missedDays: player.missedDays, lastSubmittedDayIndex: player.completedDays.at(-1), joinedAt: now - 4 * DAY_MS + i,
      });
      await ctx.db.insert("webhookEvents", {
        provider: "whop", eventId: `${eventPrefix}${i}`, eventType: "payment.succeeded",
        payloadSummary: `pot=${potId} user=${userId} payment=${paymentId}`, processedAt: now - 4 * DAY_MS + i, mode: "simulated",
      });
      for (const dayIndex of [...player.completedDays, ...(i === 2 ? [4] : [])]) {
        const issuedAt = now - (4 - dayIndex) * DAY_MS - 60_000;
        const challengeId = await ctx.db.insert("challenges", {
          potId, userId, dayIndex, habitCategory: "fitness", promptText: "Show your gym setup and today's code.",
          verificationCode: `GYM${dayIndex}${i}`, issuedAt, expiresAt: issuedAt + DAY_MS, status: "consumed",
        });
        const pending = i === 2 && dayIndex === 4;
        await ctx.db.insert("submissions", {
          potId, userId, dayIndex, challengeId, capturedAt: issuedAt + 30_000, uploadedAt: issuedAt + 45_000,
          gyroVariance: pending ? 0.04 : 0.21, screenGlareSuspected: pending, verdict: pending ? "pending" : "passed",
          ...(pending ? {} : { trustScore: 94 - i, roastMessage: i === 0 ? "Up before the excuses. Keep moving!" : "Proof accepted. The streak survives.", evaluationMode: "demo_override" as const }),
          spoofSignals: [], roastPersona: "drill_sergeant",
        });
      }
    }
    return { potId, userIds: users };
  },
});

export const fastForwardDailyDeadline = mutation({
  args: { potId: v.id("pots") },
  handler: async (ctx, { potId }): Promise<boolean> => {
    const pot = await ctx.db.get(potId);
    if (!pot || !["demo_whop_product_gym_pact", "demo_whop_product_sidequest"].includes(pot.whopProductId ?? "") || pot.status !== "active") throw new Error("Demo pot is not active");
    await ctx.db.patch(potId, { nextDeadlineAt: Date.now() - 1 });
    return await ctx.runMutation(internal.settlement.processDailyCutoff, { potId, triggeredBy: "demo" });
  },
});

export const simulateSundaySettlement = mutation({
  args: { potId: v.id("pots") },
  handler: async (ctx, { potId }): Promise<Id<"settlementEvents"> | null> => {
    const pot = await ctx.db.get(potId);
    if (!pot || !["demo_whop_product_gym_pact", "demo_whop_product_sidequest"].includes(pot.whopProductId ?? "")) throw new Error("Demo pot not found");
    if (pot.whopProductId === "demo_whop_product_sidequest" && pot.status === "active") {
      await ctx.runMutation(internal.settlement.processDailyCutoff, { potId, triggeredBy: "demo" });
    }
    return await ctx.runMutation(internal.settlement.settlePot, { potId, triggeredBy: "demo" });
  },
});

export const forceDemoSubmissionVerdict = mutation({
  args: { submissionId: v.id("submissions"), verdict: v.union(v.literal("passed"), v.literal("failed_spoof")) },
  handler: async (ctx, { submissionId, verdict }): Promise<boolean> => {
    const submission = await ctx.db.get(submissionId);
    const pot = submission && await ctx.db.get(submission.potId);
    if (!pot || pot.whopProductId !== "demo_whop_product_gym_pact" || pot.status !== "active" || pot.currentDayIndex !== submission?.dayIndex) throw new Error("Submission is not from the active demo day");
    const walk = await ctx.db.query("walkSubmissions").withIndex("by_feed_submission", q => q.eq("feedSubmissionId", submissionId)).first();
    if (walk) throw new Error("Sidequest submissions must be evaluated by the map referee");
    return await ctx.runMutation(internal.submissions.recordRefereeVerdict, {
      submissionId, verdict, trustScore: verdict === "passed" ? 96 : 12,
      spoofSignals: verdict === "passed" ? [] : ["screen_glare", "low_motion"],
      roastMessage: verdict === "passed" ? "Proof accepted. That's how you protect a streak!" : "A screen isn't a workout. Your stake is on the line!",
      evaluationMode: "demo_override",
    });
  },
});

export const simulateWhopPayment = mutation({
  args: { potId: v.id("pots"), userId: v.id("users"), whopPaymentId: v.string(), eventId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const pot = await ctx.db.get(args.potId);
    if (!pot || pot.whopProductId !== "demo_whop_product_gym_pact") throw new Error("Demo pot not found");
    return await ctx.runMutation(internal.pots.confirmWhopStake, { ...args, mode: "simulated" });
  },
});

export const seedSidequestDemoPot = mutation({
  args: {},
  handler: async (ctx): Promise<{ potId: Id<"pots">; userId: Id<"users"> }> => {
    const now = Date.now();
    const players = [
      { name: "Aahil", handle: "stage_demo_walker", completedDays: [] as number[], missedDays: [] as number[] },
      { name: "Yusuf", handle: "sidequest_demo_yusuf", completedDays: [1], missedDays: [] as number[] },
      { name: "Ibrahim", handle: "sidequest_demo_ibrahim", completedDays: [1], missedDays: [] as number[] },
      { name: "Leo", handle: "sidequest_demo_leo", completedDays: [] as number[], missedDays: [1] },
    ];
    const users = await Promise.all(players.map(async player => {
      const existing = await ctx.db.query("users").withIndex("by_handle", q => q.eq("handle", player.handle)).unique();
      const fields = { name: player.name, handle: player.handle, whopUserId: `demo_whop_user_${player.handle}`, whopWalletId: `demo_whop_wallet_${player.handle}`, simulatedWalletBalanceCents: 0 };
      if (existing) { await ctx.db.patch(existing._id, fields); return existing._id; }
      return await ctx.db.insert("users", { ...fields, createdAt: now });
    }));
    const userId = users[0];
    const existingPot = (await ctx.db.query("pots").collect()).find(pot => pot.whopProductId === "demo_whop_product_sidequest" && pot.createdByUserId === userId);
    let inviteCode = existingPot?.inviteCode;
    if (!inviteCode) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = Math.floor(Math.random() * 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
        if (!await ctx.db.query("pots").withIndex("by_invite_code", q => q.eq("inviteCode", candidate)).first()) { inviteCode = candidate; break; }
      }
      if (!inviteCode) throw new Error("Could not generate demo invite code");
    }
    const fields = {
      title: "Sidequest League", habitCategory: "fitness" as const, habitPrompt: "Walk to a nearby landmark.", inviteCode,
      challengeMode: "sidequest" as const, stakeCents: 1000, status: "active" as const,
      whopProductId: "demo_whop_product_sidequest", whopChatChannelId: "demo_whop_chat_sidequest",
      roastPersona: "drill_sergeant" as const, currentDayIndex: 1, dailyCutoffHourUtc: 7,
      nextDeadlineAt: Math.max(nextCutoff(now, 7), now + 90 * 60_000), potTotalCents: 4000, forfeitedCents: 1000, createdByUserId: userId, createdAt: now,
    };
    const potId = existingPot?._id ?? await ctx.db.insert("pots", fields);
    if (existingPot) {
      await ctx.db.patch(potId, fields);
      const memberships = await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect();
      const challenges = await ctx.db.query("challenges").withIndex("by_pot_user_day", q => q.eq("potId", potId)).collect();
      const submissions = await ctx.db.query("submissions").withIndex("by_pot_day", q => q.eq("potId", potId)).collect();
      const availability = await ctx.db.query("availabilityWindows").withIndex("by_pot_user", q => q.eq("potId", potId)).collect();
      const settlements = await ctx.db.query("settlementEvents").withIndex("by_pot", q => q.eq("potId", potId)).collect();
      const quests = await ctx.db.query("sidequests").withIndex("by_pot_user_day", q => q.eq("potId", potId)).collect();
      const walks = (await Promise.all(quests.map(quest => ctx.db.query("walkSubmissions").withIndex("by_sidequest", q => q.eq("sidequestId", quest._id)).collect()))).flat();
      for (const walk of walks) await ctx.storage.delete(walk.arrivalStorageId);
      for (const document of [...memberships, ...challenges, ...submissions, ...availability, ...settlements, ...walks, ...quests]) await ctx.db.delete(document._id);
    }
    for (const [i, player] of players.entries()) {
      const playerId = users[i];
      await ctx.db.insert("memberships", {
        potId, userId: playerId, stakeStatus: i === 3 ? "forfeited" : "funded", whopCheckoutId: `demo_checkout_${potId}_${i}`,
        whopPaymentId: `demo_payment_${potId}_${i}`, streakCount: player.completedDays.length, completedDays: player.completedDays, missedDays: player.missedDays, joinedAt: now + i,
      });
      await ctx.db.insert("availabilityWindows", { potId, userId: playerId, timezone: "America/Los_Angeles", slots: [1, 2, 3, 4, 5].map(dayOfWeek => ({ dayOfWeek, startMinute: 1020, endMinute: 1140 })), updatedAt: now });
      if (player.completedDays.length) {
        const challengeId = await ctx.db.insert("challenges", { potId, userId: playerId, dayIndex: 1, habitCategory: "fitness", promptText: "Walk to a nearby landmark.", verificationCode: `DEMO-${i}`, issuedAt: now - 1_800_000, expiresAt: now, status: "consumed" });
        await ctx.db.insert("submissions", { potId, userId: playerId, dayIndex: 1, challengeId, capturedAt: now - 60_000, uploadedAt: now - 60_000, gyroVariance: 0.2, screenGlareSuspected: false, verdict: "passed", trustScore: 92, spoofSignals: [], roastPersona: "drill_sergeant", roastMessage: `${player.name} reached the landmark. Demo receipt.`, evaluationMode: "demo_override" });
      }
    }
    return { potId, userId };
  },
});

export const demoTrigger5MinWarning = mutation({
  args: { potId: v.id("pots"), userId: v.id("users"), lat: v.number(), lng: v.number() },
  handler: async (ctx, { potId, userId, lat, lng }): Promise<Id<"sidequests">> => {
    const pot = await ctx.db.get(potId);
    if (!pot || !["demo_whop_product_gym_pact", "demo_whop_product_sidequest"].includes(pot.whopProductId ?? "") || pot.status !== "active") throw new Error("Demo pot is not active");
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Invalid coordinates");

    const landmarks = [
      { name: "Oracle Park", lat: 37.7786, lng: -122.3893, summary: "Look for the waterfront ballpark and its brick arches." },
      { name: "Crane Cove Park", lat: 37.7584, lng: -122.3868, summary: "Look for the historic shipyard cranes on the waterfront." },
      { name: "The Embarcadero", lat: 37.7937, lng: -122.3917, summary: "Look for the waterfront promenade and bay views." },
    ];
    const landmark = landmarks.find(point => {
      const distance = haversineMeters(lat, lng, point.lat, point.lng);
      return distance >= 450 && distance <= 1450;
    }) ?? { name: "Neighborhood waypoint", lat: lat <= 89.99 ? lat + 850 / 111_195 : lat - 850 / 111_195, lng, summary: "Explore the area around this map waypoint." };
    const distanceMeters = Math.round(haversineMeters(lat, lng, landmark.lat, landmark.lng));
    return await ctx.runMutation(internal.sidequests.createWarning, {
      potId, userId, lat, lng,
      discovery: {
        title: `Walk to ${landmark.name}`, instruction: `Walk to ${landmark.name}. ${landmark.summary}`,
        destName: landmark.name, destLat: landmark.lat, destLng: landmark.lng, destSummary: landmark.summary,
        destSource: "curated_fallback", distanceMeters, allottedMinutes: walkingMinutes(distanceMeters),
        targetRadiusMeters: 65, mode: "fallback",
      },
    });
  },
});

export const demoSimulateWalkTrace = mutation({
  args: { sidequestId: v.id("sidequests"), mode: v.union(v.literal("valid_walk"), v.literal("uber_spoof"), v.literal("screen_photo_spoof"), v.literal("couch_timeout")) },
  handler: async (ctx, { sidequestId, mode }): Promise<Id<"walkSubmissions">> => {
    const quest = await ctx.db.get(sidequestId);
    const pot = quest && await ctx.db.get(quest.potId);
    if (!quest || !pot || !["demo_whop_product_gym_pact", "demo_whop_product_sidequest"].includes(pot.whopProductId ?? "") || pot.status !== "active") throw new Error("Demo pot is not active");
    if (quest.status !== "warning_5m" && quest.status !== "active") throw new Error("Demo sidequest is not active");
    if (await ctx.db.query("walkSubmissions").withIndex("by_sidequest", q => q.eq("sidequestId", sidequestId)).first()) throw new Error("Demo sidequest already submitted");
    const now = Date.now();
    const distance = haversineMeters(quest.originLat, quest.originLng, quest.destLat, quest.destLng);
    const duration = mode === "couch_timeout" ? 60_000 : Math.max(8000, Math.ceil(distance / (mode === "uber_spoof" ? 14 : 1.4) * 1000));
    const start = now - duration - 1000;
    const startsAt = mode === "couch_timeout" ? start - quest.allottedMinutes * 60_000 : start;
    const expiresAt = mode === "couch_timeout" ? now - 500 : Math.max(now + 60_000, startsAt + quest.allottedMinutes * 60_000);
    await ctx.db.patch(sidequestId, { status: "active", startsAt, expiresAt });
    const lngDelta = ((quest.destLng - quest.originLng + 540) % 360) - 180;
    const points = Array.from({ length: 9 }, (_, i) => {
      const progress = mode === "couch_timeout" ? 0 : i / 8;
      return {
        lat: quest.originLat + (quest.destLat - quest.originLat) * progress,
        lng: ((quest.originLng + lngDelta * progress + 540) % 360) - 180,
        timestamp: start + Math.round(duration * i / 8), accuracyM: 5,
        speedMps: mode === "couch_timeout" ? 0 : mode === "uber_spoof" ? 14 : 1.4,
      };
    });
    const bytes = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCABAAGADASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAQBAwUCBv/EAC8QAAICAQIDBwMDBQAAAAAAAAECAAMRBBIhMVEFEyJBYXGRFBWBQlLRIzJiobH/xAAYAQADAQEAAAAAAAAAAAAAAAAAAQMEAv/EAB8RAAIDAAICAwAAAAAAAAAAAAABAgMREiEEMRNBQv/aAAwDAQACEQMRAD8A1YQhNRiCEIQAIQhAAhCEAJAJIAGSeQEuOj1ATd3Rx/v4jHZSKbHc81AA/M05kt8hwlxSNFdKlHWedhGu0kVNVlf1DcfeKzTCXKKZCS4vAhCQzBVLMcAToRJIAyeAhENRqDb4VyE/7J0+pKEK5ynL2kvmjuDwehIVgyhlOQZMqIIQhAC3T3tp7Q6jPkR1EePadezIrbd08vmZW9d+zcN3SdSU6oTes7jZKKxHdtjW2M78z0nEISqWdI49kM6oMsQB6zPvvNzdFHITm61rXyeXkOkrmSyzl0vR0kEIQkjotpueo8OK+Yj9dqWjKH3HSZc6R2rbcpwZWFjj19CaNRmCqWY4Aid2rLZWvgOvWUWWvacufYdJxHO1vpCSCMV6qxODeMevOLwklJr0M06rktHhPHoecsmSCQcjgYxVq3Xg/iHXzmiNy/Ry0YtWt1V1grqpFjnkqqST+JYLu0DaahpGNgG4p3bZA64lHZhA1ZDMq7qbVBZgoya2A4n1Mf0xqXQvpLrK3s7puC3qvA2VkKGOR+lj+ZLEVSFbNVrKlLWafYobYSyEANjOPedLd2g1rVLpGNigFlFbZAPLIjOmOm+hGkusRE797SptVsYFfmOByu8DqZHaNv3BAK7qu9zW9m6wKGzUg5k44ENw9YYgwTTW6qy0VJSGsJwECkknpid16jXW1myvSl61yCy1sQMc+MsOopTX6jVFy+yoICj7S7lQrMMg/wCRziMi/Rrdp3VgGbVPdXiwYqLLWRuGOIB4eXIwxBiE+97QCox0jbbCAh7tsNnljrmV/W6rcF7kZI3AbTxGM59ppaXU6VddUwcIwXSh3awbSB3eQB5EEDPE8jEqbEbs9X7xBeqtp1BYA4Y5z7YLjPtDEGIr+r1fh/of3KXXwHiozkj04Hj6Sv7ld+2v4P8AM01v02odlrcJ3K21IbLVAdTUyrjOMDKj8tMS2pqX2sUJxnwOGHyDDEJoY+5Xftr+D/MPuV37a/g/zE4QxAf/2Q=="), char => char.charCodeAt(0));
    const arrivalStorageId = await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
    return await ctx.runMutation(api.mapReferee.submitWalkTrace, {
      sidequestId, userId: quest.userId, points, arrivalStorageId, arrivalCapturedAt: points[points.length - 1].timestamp,
      gyroVariance: mode === "screen_photo_spoof" ? 0.001 : 0.2, screenGlareSuspected: mode === "screen_photo_spoof",
    });
  },
});
