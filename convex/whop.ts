import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalAction, internalQuery } from "./_generated/server";

export const createPotCheckout = action({
  args: { potId: v.id("pots"), userId: v.id("users") },
  handler: async (_ctx, { potId, userId }): Promise<{ checkoutId: string; checkoutUrl: null; mode: "fallback" }> => ({
    checkoutId: `fallback_checkout_${potId}_${userId}`,
    checkoutUrl: null,
    mode: "fallback",
  }),
});

export const getSettlementForTransfers = internalQuery({
  args: { settlementEventId: v.id("settlementEvents") },
  handler: async (ctx, { settlementEventId }): Promise<Doc<"settlementEvents"> | null> => await ctx.db.get(settlementEventId),
});

export const executePotTransfers = internalAction({
  args: { settlementEventId: v.id("settlementEvents") },
  handler: async (ctx, { settlementEventId }): Promise<void> => {
    const settlement = await ctx.runQuery(internal.whop.getSettlementForTransfers, { settlementEventId });
    if (!settlement) return;
    for (const transfer of settlement.transfers) {
      if (transfer.status !== "pending") continue;
      await ctx.runMutation(internal.pots.recordTransferResult, {
        settlementEventId, userId: transfer.userId,
        whopTransferId: `fallback_transfer_${settlementEventId}_${transfer.userId}`,
        status: "fallback", mode: "fallback",
      });
    }
  },
});

export const postChatAnnouncement = internalAction({
  args: { potId: v.id("pots"), message: v.string() },
  handler: async (_ctx, { potId, message }): Promise<{ postId: string; mode: "fallback" }> => {
    let hash = 0;
    for (const char of message) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    return { postId: `fallback_chat_${potId}_${hash}`, mode: "fallback" };
  },
});
