import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
    const current = existing.find((challenge) => challenge.status === "issued" && challenge.expiresAt > now);
    if (current) return current._id;
    const seed = `${potId}:${userId}:${pot.currentDayIndex}`;
    let hash = 0;
    for (const char of seed) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    return await ctx.db.insert("challenges", {
      potId, userId, dayIndex: pot.currentDayIndex, habitCategory: pot.habitCategory,
      promptText: pot.habitPrompt, verificationCode: String(hash % 1000000).padStart(6, "0"),
      issuedAt: now, expiresAt: pot.nextDeadlineAt, status: "issued",
    });
  },
});
