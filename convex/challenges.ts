import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const issueCameraChallenge = mutation({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }) => {
    const pot = await ctx.db.get(potId);
    if (!pot || pot.status !== "active") throw new Error("Pot is not active");
    const membership = await ctx.db.query("memberships")
      .withIndex("by_pot_user", (q) => q.eq("potId", potId).eq("userId", userId)).unique();
    if (!membership || membership.stakeStatus !== "funded") throw new Error("A funded membership is required");
    const now = Date.now();
    if (pot.nextDeadlineAt <= now) throw new Error("Today's submission deadline has passed");
    const existing = await ctx.db.query("challenges")
      .withIndex("by_pot_user_day", (q) => q.eq("potId", potId).eq("userId", userId).eq("dayIndex", pot.currentDayIndex))
      .collect();
    const current = existing
      .filter((challenge) => challenge.status === "issued" && challenge.expiresAt > now + 15_000 && challenge.expiresAt <= pot.nextDeadlineAt)
      .sort((a, b) => b.issuedAt - a.issuedAt)[0];
    for (const challenge of existing) {
      if (challenge.status === "issued" && challenge._id !== current?._id) {
        await ctx.db.patch(challenge._id, { status: "expired" });
      }
    }
    if (current) return current._id;

    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const random = crypto.getRandomValues(new Uint8Array(4));
    const verificationCode = Array.from(random.slice(0, 3), (byte) => alphabet[byte & 31]).join("");
    const prompts = {
      fitness: [
        `Hold up 2 fingers in front of your gym equipment while showing proof of ${pot.habitPrompt}`,
        `Give a thumbs-up next to a dumbbell, rack, or treadmill while showing proof of ${pot.habitPrompt}`,
        `Show a peace sign with gym floor and weights in frame while showing proof of ${pot.habitPrompt}`,
      ],
      coding: [
        `Write ${verificationCode} on a sticky note or paper held beside your code editor showing ${pot.habitPrompt}`,
        `Type ${verificationCode} in a comment or terminal next to your ${pot.habitPrompt} and show 2 fingers`,
      ],
      wakeup: [
        `Stand in a lit bathroom or kitchen showing running tap water and 2 fingers up for ${pot.habitPrompt}`,
        `Hold a mug or toothbrush upright out of bed and show a peace sign for ${pot.habitPrompt}`,
      ],
      custom: [
        `Show 2 fingers clearly next to proof of ${pot.habitPrompt}`,
        `Give a thumbs-up next to proof of ${pot.habitPrompt}`,
      ],
    }[pot.habitCategory];
    return await ctx.db.insert("challenges", {
      potId, userId, dayIndex: pot.currentDayIndex, habitCategory: pot.habitCategory,
      promptText: `${prompts[random[3] % prompts.length]} (code ${verificationCode})`, verificationCode,
      issuedAt: now, expiresAt: Math.min(now + 60_000, pot.nextDeadlineAt), status: "issued",
    });
  },
});

export const getChallenge = query({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, { challengeId }) => await ctx.db.get(challengeId),
});

export const getActiveChallenge = query({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (ctx, { potId, userId }) => {
    const pot = await ctx.db.get(potId);
    const now = Date.now();
    if (!pot || pot.status !== "active" || pot.nextDeadlineAt <= now) return null;
    const membership = await ctx.db.query("memberships")
      .withIndex("by_pot_user", (q) => q.eq("potId", potId).eq("userId", userId)).unique();
    if (!membership || membership.stakeStatus !== "funded") return null;
    const challenges = await ctx.db.query("challenges")
      .withIndex("by_pot_user_day", (q) => q.eq("potId", potId).eq("userId", userId).eq("dayIndex", pot.currentDayIndex))
      .collect();
    return challenges
      .filter((challenge) => challenge.status === "issued" && challenge.expiresAt > now)
      .sort((a, b) => b.issuedAt - a.issuedAt)[0] ?? null;
  },
});
