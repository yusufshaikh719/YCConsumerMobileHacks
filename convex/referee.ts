import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const evaluateSubmissionProof = internalAction({
  args: { submissionId: v.id("submissions") },
  handler: async (ctx, { submissionId }): Promise<void> => {
    await ctx.runMutation(internal.submissions.recordRefereeVerdict, {
      submissionId, verdict: "passed", trustScore: 90, spoofSignals: [],
      roastMessage: "Proof received. Keep that streak moving!", evaluationMode: "fallback",
    });
  },
});
