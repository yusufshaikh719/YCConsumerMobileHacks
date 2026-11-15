import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { DAY_MS } from "./lib/contracts";

const trigger = v.union(v.literal("cron"), v.literal("demo"));

export const processDailyCutoff = internalMutation({
  args: { potId: v.id("pots"), triggeredBy: trigger },
  handler: async (ctx, { potId, triggeredBy }) => {
    const pot = await ctx.db.get(potId);
    if (pot?.challengeMode === "ante_weekly") {
      await ctx.runMutation(internal.ante.settleWeek, { potId, triggeredBy });
      return true;
    }
    if (!pot || pot.status !== "active") return false;
    const members = await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect();
    let forfeitedCents = pot.forfeitedCents;
    for (const member of members) {
      if (member.stakeStatus !== "funded") continue;
      const submissions = await ctx.db.query("submissions").withIndex("by_pot_user_day", q => q.eq("potId", potId).eq("userId", member.userId).eq("dayIndex", pot.currentDayIndex)).collect();
      if (submissions.some(s => s.verdict === "passed")) continue;
      await ctx.db.patch(member._id, { stakeStatus: "forfeited", missedDays: [...new Set([...member.missedDays, pot.currentDayIndex])], streakCount: 0 });
      forfeitedCents += pot.stakeCents;
      const user = await ctx.db.get(member.userId);
      await ctx.scheduler.runAfter(0, internal.whop.postChatAnnouncement, { potId, message: `${user?.name ?? "A member"} missed day ${pot.currentDayIndex} and forfeited their stake.` });
    }
    await ctx.db.patch(potId, { forfeitedCents, ...(pot.currentDayIndex < 7 ? { currentDayIndex: pot.currentDayIndex + 1, nextDeadlineAt: pot.nextDeadlineAt + DAY_MS } : { status: "settling" as const }) });
    if (pot.currentDayIndex === 7) await ctx.runMutation(internal.settlement.settlePot, { potId, triggeredBy });
    return true;
  },
});

export const settlePot = internalMutation({
  args: { potId: v.id("pots"), triggeredBy: trigger },
  handler: async (ctx, { potId, triggeredBy }) => {
    const pot = await ctx.db.get(potId);
    if (!pot) throw new Error("Pot not found");
    const existing = await ctx.db.query("settlementEvents").withIndex("by_pot", q => q.eq("potId", potId)).order("desc").first();
    if (pot.status === "settled") return existing?._id ?? null;
    if (pot.status !== "active" && pot.status !== "settling") throw new Error("Pot is not active");
    const members = (await ctx.db.query("memberships").withIndex("by_pot", q => q.eq("potId", potId)).collect()).filter(m => m.stakeStatus !== "pending_checkout");
    members.sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
    if (!members.length || pot.potTotalCents !== members.length * pot.stakeCents) throw new Error("Pot funding is inconsistent");
    const losers = members.filter(m => m.stakeStatus === "forfeited" || m.missedDays.length > 0);
    let winners = members.filter(m => m.stakeStatus === "funded" && m.missedDays.length === 0);
    if (!winners.length) {
      const best = Math.max(...members.map(m => m.completedDays.length));
      winners = members.filter(m => m.completedDays.length === best);
    }
    const perWinnerPayoutCents = Math.floor(pot.potTotalCents / winners.length);
    const remainderCents = pot.potTotalCents % winners.length;
    const transfers = [];
    for (const member of members) {
      const index = winners.findIndex(w => w._id === member._id);
      const payoutCents = index < 0 ? 0 : perWinnerPayoutCents + (index < remainderCents ? 1 : 0);
      await ctx.db.patch(member._id, { stakeStatus: index >= 0 ? "won" : "forfeited", payoutCents });
      if (index >= 0) {
        const user = await ctx.db.get(member.userId);
        if (!user) throw new Error("Winner not found");
        await ctx.db.patch(user._id, { simulatedWalletBalanceCents: user.simulatedWalletBalanceCents + payoutCents });
        transfers.push({ userId: user._id, whopUserId: user.whopUserId, amountCents: payoutCents, status: "pending" as const, mode: "fallback" as const });
      }
    }
    const summaryMessage = `Settled ${pot.title}: ${winners.length} winner${winners.length === 1 ? "" : "s"} split ${pot.potTotalCents} cents.`;
    const eventId = await ctx.db.insert("settlementEvents", { potId, triggeredBy, totalPotCents: pot.potTotalCents, forfeitedPoolCents: pot.forfeitedCents, winnerUserIds: winners.map(m => m.userId), loserUserIds: losers.map(m => m.userId), perWinnerPayoutCents, remainderCents, transfers, summaryMessage, createdAt: Date.now() });
    await ctx.db.patch(potId, { status: "settled" });
    await ctx.scheduler.runAfter(0, internal.whop.executePotTransfers, { settlementEventId: eventId });
    await ctx.scheduler.runAfter(0, internal.whop.postChatAnnouncement, { potId, message: summaryMessage });
    return eventId;
  },
});

export const sweepExpiredDeadlines = internalMutation({
  args: {},
  handler: async ctx => {
    const pots = await ctx.db.query("pots").withIndex("by_status_deadline", q => q.eq("status", "active").lte("nextDeadlineAt", Date.now())).collect();
    for (const pot of pots) await ctx.runMutation(internal.settlement.processDailyCutoff, { potId: pot._id, triggeredBy: "cron" });
    const idleWeeks = await ctx.db.query("pots").withIndex("by_status_deadline", q => q.eq("status", "open").lte("nextDeadlineAt", Date.now())).collect();
    for (const pot of idleWeeks) if (pot.challengeMode === "ante_weekly") await ctx.runMutation(internal.ante.settleWeek, { potId: pot._id, triggeredBy: "cron" });
  },
});
