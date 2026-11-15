import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { DAY_MS, nextCutoff } from "./lib/contracts";

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
    if (!pot || pot.whopProductId !== "demo_whop_product_gym_pact" || pot.status !== "active") throw new Error("Demo pot is not active");
    await ctx.db.patch(potId, { nextDeadlineAt: Date.now() - 1 });
    return await ctx.runMutation(internal.settlement.processDailyCutoff, { potId, triggeredBy: "demo" });
  },
});

export const simulateSundaySettlement = mutation({
  args: { potId: v.id("pots") },
  handler: async (ctx, { potId }): Promise<Id<"settlementEvents"> | null> => {
    const pot = await ctx.db.get(potId);
    if (!pot || pot.whopProductId !== "demo_whop_product_gym_pact") throw new Error("Demo pot not found");
    return await ctx.runMutation(internal.settlement.settlePot, { potId, triggeredBy: "demo" });
  },
});

export const forceDemoSubmissionVerdict = mutation({
  args: { submissionId: v.id("submissions"), verdict: v.union(v.literal("passed"), v.literal("failed_spoof")) },
  handler: async (ctx, { submissionId, verdict }): Promise<boolean> => {
    const submission = await ctx.db.get(submissionId);
    const pot = submission && await ctx.db.get(submission.potId);
    if (!pot || pot.whopProductId !== "demo_whop_product_gym_pact" || pot.status !== "active" || pot.currentDayIndex !== submission?.dayIndex) throw new Error("Submission is not from the active demo day");
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
