import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { evaluationMode, verdict } from "./lib/contracts";

export const generateUploadUrl = mutation({ args: {}, handler: async ctx => await ctx.storage.generateUploadUrl() });

export const submitLiveProof = mutation({
  args: { potId: v.id("pots"), userId: v.id("users"), challengeId: v.id("challenges"), storageId: v.id("_storage"), capturedAt: v.number(), gyroVariance: v.number(), screenGlareSuspected: v.boolean() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const pot = await ctx.db.get(args.potId);
    const challenge = await ctx.db.get(args.challengeId);
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", args.potId).eq("userId", args.userId)).unique();
    if (!pot || pot.status !== "active" || !member || member.stakeStatus !== "funded" || now >= pot.nextDeadlineAt) throw new Error("Membership or submission window is not active");
    if (!challenge || challenge.potId !== args.potId || challenge.userId !== args.userId || challenge.dayIndex !== pot.currentDayIndex || challenge.status !== "issued" || now > challenge.expiresAt || args.capturedAt < challenge.issuedAt || args.capturedAt > now || args.capturedAt > challenge.expiresAt) throw new Error("Invalid or expired challenge");
    if (!Number.isFinite(args.capturedAt) || !Number.isFinite(args.gyroVariance) || args.gyroVariance < 0) throw new Error("Invalid telemetry");
    if (!await ctx.db.system.get(args.storageId)) throw new Error("Proof image not found");
    const existing = await ctx.db.query("submissions").withIndex("by_pot_user_day", q => q.eq("potId", args.potId).eq("userId", args.userId).eq("dayIndex", pot.currentDayIndex)).collect();
    if (existing.some(s => s.verdict === "pending" || s.verdict === "passed")) throw new Error("Already submitted for this day");
    await ctx.db.patch(challenge._id, { status: "consumed" });
    const submissionId = await ctx.db.insert("submissions", { ...args, dayIndex: pot.currentDayIndex, uploadedAt: now, imageUrl: (await ctx.storage.getUrl(args.storageId)) ?? undefined, verdict: "pending", spoofSignals: [], roastPersona: pot.roastPersona });
    await ctx.scheduler.runAfter(0, internal.referee.evaluateSubmissionProof, { submissionId });
    return submissionId;
  },
});

export const listPotFeed = query({ args: { potId: v.id("pots") }, handler: async (ctx, { potId }) => await ctx.db.query("submissions").withIndex("by_pot_day", q => q.eq("potId", potId)).order("desc").take(50) });

export const recordRefereeVerdict = internalMutation({
  args: { submissionId: v.id("submissions"), verdict, trustScore: v.number(), spoofSignals: v.array(v.string()), roastMessage: v.string(), evaluationMode },
  handler: async (ctx, args) => {
    if (args.verdict === "pending" || !Number.isFinite(args.trustScore) || args.trustScore < 0 || args.trustScore > 100) throw new Error("Invalid final verdict");
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new Error("Submission not found");
    const pot = await ctx.db.get(submission.potId);
    const member = await ctx.db.query("memberships").withIndex("by_pot_user", q => q.eq("potId", submission.potId).eq("userId", submission.userId)).unique();
    if (args.evaluationMode === "demo_override") {
      if (!pot || pot.status !== "active" || pot.currentDayIndex !== submission.dayIndex || member?.stakeStatus !== "funded") throw new Error("Demo verdict requires a funded member on the active day");
    } else if (submission.verdict !== "pending") return false;
    await ctx.db.patch(submission._id, { verdict: args.verdict, trustScore: args.trustScore, spoofSignals: args.spoofSignals, roastMessage: args.roastMessage, evaluationMode: args.evaluationMode });
    if (args.verdict === "passed" && pot?.status === "active" && pot.currentDayIndex === submission.dayIndex && member?.stakeStatus === "funded" && !member.completedDays.includes(submission.dayIndex)) {
      const completedDays = [...member.completedDays, submission.dayIndex];
      let streakCount = 0;
      for (let day = submission.dayIndex; completedDays.includes(day); day--) streakCount++;
      await ctx.db.patch(member._id, { completedDays, streakCount, lastSubmittedDayIndex: submission.dayIndex });
    } else if (args.evaluationMode === "demo_override" && args.verdict !== "passed" && submission.verdict === "passed" && member && member.completedDays.includes(submission.dayIndex)) {
      const completedDays = member.completedDays.filter(day => day !== submission.dayIndex);
      const lastSubmittedDayIndex = completedDays.length ? Math.max(...completedDays) : undefined;
      let streakCount = 0;
      if (lastSubmittedDayIndex !== undefined) for (let day = lastSubmittedDayIndex; completedDays.includes(day); day--) streakCount++;
      await ctx.db.patch(member._id, { completedDays, streakCount, lastSubmittedDayIndex });
    }
    await ctx.scheduler.runAfter(0, internal.whop.postChatAnnouncement, { potId: submission.potId, message: args.roastMessage });
    return true;
  },
});
