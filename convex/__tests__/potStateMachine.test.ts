import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const now = Date.UTC(2026, 0, 5, 6);

type TestBackend = TestConvex<typeof schema>;

async function user(t: TestBackend, name: string) {
  return await t.run(async (ctx) => ctx.db.insert("users", {
    name, handle: name.toLowerCase(), whopUserId: `whop_${name}`,
    simulatedWalletBalanceCents: 0, createdAt: now,
  }));
}

async function createFundedPot(t: TestBackend, count: number, stakeCents = 1000) {
  const users = await Promise.all(Array.from({ length: count }, (_, i) => user(t, `User${i}`)));
  const potId = await t.mutation(api.pots.createPot, {
    title: "Morning pact", habitCategory: "fitness", habitPrompt: "Go to the gym",
    createdByUserId: users[0], stakeCents,
  });
  for (const [i, userId] of users.entries()) {
    await t.mutation(api.pots.joinPotPendingCheckout, { potId, userId });
    await t.mutation(internal.pots.confirmWhopStake, {
      potId, userId, whopPaymentId: `payment_${potId}_${i}`, eventId: `event_${potId}_${i}`, mode: "simulated",
    });
  }
  return { potId, users };
}

async function members(t: TestBackend, potId: Id<"pots">) {
  return await t.run(async (ctx) => ctx.db.query("memberships")
    .withIndex("by_pot", (q) => q.eq("potId", potId)).collect());
}

async function proof(t: TestBackend, potId: Id<"pots">, userId: Id<"users">) {
  const { challengeId, storageId } = await t.run(async (ctx) => {
    const pot = await ctx.db.get(potId);
    if (!pot) throw new Error("Missing pot");
    const challengeId = await ctx.db.insert("challenges", {
      potId, userId, dayIndex: pot.currentDayIndex, habitCategory: pot.habitCategory,
      promptText: pot.habitPrompt, verificationCode: "123456", issuedAt: now - 1000,
      expiresAt: pot.nextDeadlineAt, status: "issued",
    });
    const storageId = await ctx.storage.store(new Blob(["proof"], { type: "image/jpeg" }));
    return { challengeId, storageId };
  });
  const args = { potId, userId, challengeId, storageId, capturedAt: now, gyroVariance: 0.42, screenGlareSuspected: false };
  const submissionId = await t.mutation(api.submissions.submitLiveProof, args);
  return { submissionId, args };
}

async function setResults(t: TestBackend, potId: Id<"pots">, results: Array<{ completedDays: number[]; missedDays: number[] }>) {
  const potMembers = await members(t, potId);
  await t.run(async (ctx) => {
    for (const [i, result] of results.entries()) {
      await ctx.db.patch(potMembers[i]._id, {
        ...result, streakCount: result.completedDays.length,
        stakeStatus: result.missedDays.length ? "forfeited" : "funded",
      });
    }
    const pot = await ctx.db.get(potId);
    if (!pot) throw new Error("Missing pot");
    await ctx.db.patch(potId, { currentDayIndex: 7, forfeitedCents: results.filter((r) => r.missedDays.length).length * pot.stakeCents });
  });
}

describe("pot state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("creates a pot with defaults and funds each membership once per payment and webhook", async () => {
    const t = convexTest(schema, modules);
    const creator = await user(t, "Creator");
    const other = await user(t, "Other");
    const potId = await t.mutation(api.pots.createPot, {
      title: "Gym", habitCategory: "fitness", habitPrompt: "Train", createdByUserId: creator,
    });
    const pot = await t.run(async (ctx) => ctx.db.get(potId));
    expect(pot).toMatchObject({ status: "open", stakeCents: 1000, currentDayIndex: 1, potTotalCents: 0, forfeitedCents: 0 });
    expect(pot!.nextDeadlineAt).toBeGreaterThan(now);
    await t.mutation(api.pots.joinPotPendingCheckout, { potId, userId: creator });
    await t.mutation(api.pots.joinPotPendingCheckout, { potId, userId: creator });
    await t.mutation(api.pots.joinPotPendingCheckout, { potId, userId: other });
    const funding = { potId, userId: creator, whopPaymentId: "pay_1", eventId: "evt_1", mode: "live" as const };
    await t.mutation(internal.pots.confirmWhopStake, funding);
    await t.mutation(internal.pots.confirmWhopStake, funding);
    await t.mutation(internal.pots.confirmWhopStake, { ...funding, eventId: "evt_retry" });
    await t.mutation(internal.pots.confirmWhopStake, { ...funding, userId: other, whopPaymentId: "pay_2" });
    await expect(t.mutation(internal.pots.confirmWhopStake, { ...funding, userId: other, eventId: "evt_other" })).rejects.toThrow();
    const [updated, memberships, events] = await t.run(async (ctx) => Promise.all([
      ctx.db.get(potId), ctx.db.query("memberships").collect(), ctx.db.query("webhookEvents").collect(),
    ]));
    expect(updated).toMatchObject({ status: "active", potTotalCents: 1000 });
    expect(memberships).toHaveLength(2);
    expect(memberships.find((m) => m.userId === creator)).toMatchObject({ stakeStatus: "funded", whopPaymentId: "pay_1" });
    expect(memberships.find((m) => m.userId === other)?.stakeStatus).toBe("pending_checkout");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ eventId: "evt_1", eventType: "payment.succeeded", mode: "live" });
  });

  it("records a live proof and applies a referee verdict once", async () => {
    const t = convexTest(schema, modules);
    const { potId, users } = await createFundedPot(t, 1);
    const { submissionId, args } = await proof(t, potId, users[0]);
    const submission = await t.run(async (ctx) => ctx.db.get(submissionId));
    expect(submission).toMatchObject({ potId, userId: users[0], dayIndex: 1, verdict: "pending", gyroVariance: 0.42, screenGlareSuspected: false });
    await expect(t.mutation(api.submissions.submitLiveProof, args)).rejects.toThrow();
    const verdict = { submissionId, verdict: "passed" as const, trustScore: 94, spoofSignals: [], roastMessage: "Nice work", evaluationMode: "live" as const };
    await t.mutation(internal.submissions.recordRefereeVerdict, verdict);
    await t.mutation(internal.submissions.recordRefereeVerdict, verdict);
    expect(await t.run(async (ctx) => ctx.db.get(submissionId))).toMatchObject({ verdict: "passed", trustScore: 94, roastMessage: "Nice work", evaluationMode: "live" });
    expect((await members(t, potId))[0]).toMatchObject({ streakCount: 1, completedDays: [1], missedDays: [] });
  });

  it("rejects an expired or another member's challenge and records spoof failures", async () => {
    const t = convexTest(schema, modules);
    const { potId, users } = await createFundedPot(t, 2);
    const { submissionId, args } = await proof(t, potId, users[0]);
    await expect(t.mutation(api.submissions.submitLiveProof, { ...args, userId: users[1] })).rejects.toThrow();
    await t.mutation(internal.submissions.recordRefereeVerdict, {
      submissionId, verdict: "failed_spoof", trustScore: 5, spoofSignals: ["screen_glare"],
      roastMessage: "That is a screen", evaluationMode: "demo_override",
    });
    expect(await t.run(async (ctx) => ctx.db.get(submissionId))).toMatchObject({ verdict: "failed_spoof", trustScore: 5, spoofSignals: ["screen_glare"] });
    expect((await members(t, potId))[0].completedDays).toEqual([]);
    const challengeId = await t.run(async (ctx) => ctx.db.insert("challenges", {
      potId, userId: users[1], dayIndex: 1, habitCategory: "fitness", promptText: "Train",
      verificationCode: "123456", issuedAt: now - 2000, expiresAt: now - 1000, status: "issued",
    }));
    await expect(t.mutation(api.submissions.submitLiveProof, { ...args, userId: users[1], challengeId })).rejects.toThrow();
  });

  it("forfeits missed and pending proofs at cutoff without forfeiting twice", async () => {
    const t = convexTest(schema, modules);
    const { potId, users } = await createFundedPot(t, 3);
    const passed = await proof(t, potId, users[0]);
    await t.mutation(internal.submissions.recordRefereeVerdict, {
      submissionId: passed.submissionId, verdict: "passed", trustScore: 90,
      spoofSignals: [], roastMessage: "Done", evaluationMode: "fallback",
    });
    await proof(t, potId, users[1]);
    await t.mutation(internal.settlement.processDailyCutoff, { potId, triggeredBy: "demo" });
    const after = await members(t, potId);
    expect(after[0]).toMatchObject({ stakeStatus: "funded", completedDays: [1], missedDays: [] });
    expect(after[1]).toMatchObject({ stakeStatus: "forfeited", missedDays: [1] });
    expect(after[2]).toMatchObject({ stakeStatus: "forfeited", missedDays: [1] });
    expect(await t.run(async (ctx) => ctx.db.get(potId))).toMatchObject({ currentDayIndex: 2, forfeitedCents: 2000 });
    await t.mutation(internal.settlement.processDailyCutoff, { potId, triggeredBy: "demo" });
    expect(await t.run(async (ctx) => ctx.db.get(potId))).toMatchObject({ currentDayIndex: 3, forfeitedCents: 3000 });
  });

  it("sweeps only expired active pots", async () => {
    const t = convexTest(schema, modules);
    const expired = await createFundedPot(t, 1);
    const future = await createFundedPot(t, 1);
    await t.run(async (ctx) => ctx.db.patch(expired.potId, { nextDeadlineAt: now }));
    await t.mutation(internal.settlement.sweepExpiredDeadlines, {});
    expect(await t.run(async (ctx) => ctx.db.get(expired.potId))).toMatchObject({ currentDayIndex: 2, forfeitedCents: 1000 });
    expect((await members(t, expired.potId))[0]).toMatchObject({ stakeStatus: "forfeited", missedDays: [1] });
    expect(await t.run(async (ctx) => ctx.db.get(future.potId))).toMatchObject({ currentDayIndex: 1, forfeitedCents: 0 });
    expect((await members(t, future.potId))[0]).toMatchObject({ stakeStatus: "funded", missedDays: [] });
  });

  it("executes fallback transfers once and records transfer identifiers", async () => {
    const t = convexTest(schema, modules);
    const { potId, users } = await createFundedPot(t, 2);
    const eventId = await t.mutation(internal.settlement.settlePot, { potId, triggeredBy: "demo" });
    expect(eventId).toBeTruthy();
    if (!eventId) throw new Error("Missing settlement event");
    await t.action(internal.whop.executePotTransfers, { settlementEventId: eventId });
    const first = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(first?.transfers).toHaveLength(2);
    for (const transfer of first!.transfers) {
      expect(transfer).toMatchObject({ status: "fallback", mode: "fallback", whopTransferId: `fallback_transfer_${eventId}_${transfer.userId}` });
      expect((await members(t, potId)).find((m) => m.userId === transfer.userId)?.whopTransferId).toBe(transfer.whopTransferId);
    }
    const balances = await t.run(async (ctx) => Promise.all(users.map((id) => ctx.db.get(id))));
    await t.action(internal.whop.executePotTransfers, { settlementEventId: eventId });
    expect(await t.run(async (ctx) => ctx.db.get(eventId))).toEqual(first);
    expect(await t.run(async (ctx) => Promise.all(users.map((id) => ctx.db.get(id))))).toEqual(balances);
  });

  it.each([
    { name: "standard split", stake: 1000, results: [{ completedDays: [1, 2], missedDays: [] }, { completedDays: [1], missedDays: [2] }, { completedDays: [1, 2], missedDays: [] }], payouts: [1500, 0, 1500] },
    { name: "all-winner refund", stake: 1000, results: [{ completedDays: [1], missedDays: [] }, { completedDays: [1], missedDays: [] }], payouts: [1000, 1000] },
    { name: "all-losers highest-completion tie-breaker", stake: 1000, results: [{ completedDays: [1, 2], missedDays: [3] }, { completedDays: [1], missedDays: [2] }, { completedDays: [1, 2], missedDays: [3] }], payouts: [1500, 0, 1500] },
    { name: "odd-cent remainder", stake: 1001, results: [{ completedDays: [1], missedDays: [] }, { completedDays: [], missedDays: [1] }, { completedDays: [1], missedDays: [] }], payouts: [1502, 0, 1501] },
  ])("settles $name and accounts for every cent", async ({ name, stake, results, payouts }) => {
    const t = convexTest(schema, modules);
    const { potId, users } = await createFundedPot(t, results.length, stake);
    await setResults(t, potId, results);
    await t.mutation(internal.settlement.settlePot, { potId, triggeredBy: "demo" });
    const [pot, potMembers, wallets, events] = await t.run(async (ctx) => Promise.all([
      ctx.db.get(potId), ctx.db.query("memberships").withIndex("by_pot", (q) => q.eq("potId", potId)).collect(),
      Promise.all(users.map((id) => ctx.db.get(id))), ctx.db.query("settlementEvents").collect(),
    ]));
    expect(pot?.status).toBe("settled");
    const actualPayouts = potMembers.map((m) => m.payoutCents ?? 0);
    if (name === "odd-cent remainder") {
      expect(actualPayouts[1]).toBe(0);
      expect([actualPayouts[0], actualPayouts[2]].sort()).toEqual([1501, 1502]);
    } else {
      expect(actualPayouts).toEqual(payouts);
    }
    expect(wallets.map((u) => u?.simulatedWalletBalanceCents)).toEqual(actualPayouts);
    expect(actualPayouts.reduce((sum, value) => sum + value, 0)).toBe(stake * users.length);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ triggeredBy: "demo", totalPotCents: stake * users.length, remainderCents: (stake * users.length) % payouts.filter(Boolean).length });
    expect(events[0].transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0)).toBe(stake * users.length);
    await t.mutation(internal.settlement.settlePot, { potId, triggeredBy: "demo" });
    expect(await t.run(async (ctx) => ctx.db.query("settlementEvents").collect())).toHaveLength(1);
    expect(await t.run(async (ctx) => Promise.all(users.map((id) => ctx.db.get(id))))).toEqual(wallets);
  });

  it("seeds the stage demo idempotently and settles the seeded pot", async () => {
    const t = convexTest(schema, modules);
    const { potId, userIds } = await t.mutation(api.demo.seedStageDemoPot, {});
    await t.mutation(api.demo.seedStageDemoPot, {});
    await t.mutation(api.demo.simulateWhopPayment, { potId, userId: userIds[0], whopPaymentId: `demo_payment_${potId}_0`, eventId: "stage_replay" });
    await t.mutation(api.demo.simulateWhopPayment, { potId, userId: userIds[0], whopPaymentId: `demo_payment_${potId}_0`, eventId: "stage_replay" });
    expect((await t.run(async ctx => ctx.db.query("webhookEvents").collect())).filter(event => event.eventId === "stage_replay")).toHaveLength(1);
    const [pots, seededMembers] = await t.run(async (ctx) => Promise.all([
      ctx.db.query("pots").collect(), ctx.db.query("memberships").withIndex("by_pot", (q) => q.eq("potId", potId)).collect(),
    ]));
    expect(pots).toHaveLength(1);
    expect(pots[0]).toMatchObject({ title: "7 AM Gym Iron Pact", potTotalCents: 4000 });
    expect(seededMembers).toHaveLength(4);
    await t.mutation(api.demo.simulateSundaySettlement, { potId });
    const [settled, events, paid] = await t.run(async (ctx) => Promise.all([
      ctx.db.get(potId), ctx.db.query("settlementEvents").collect(),
      ctx.db.query("memberships").withIndex("by_pot", (q) => q.eq("potId", potId)).collect(),
    ]));
    expect(settled?.status).toBe("settled");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ triggeredBy: "demo", totalPotCents: 4000 });
    expect(paid.reduce((sum, member) => sum + (member.payoutCents ?? 0), 0)).toBe(4000);
  });

  it("toggles a demo verdict and rolls back then restores the current-day streak", async () => {
    const t = convexTest(schema, modules);
    const { potId } = await t.mutation(api.demo.seedStageDemoPot, {});
    const pending = await t.run(async (ctx) => (await ctx.db.query("submissions")
      .withIndex("by_pot_day", (q) => q.eq("potId", potId).eq("dayIndex", 4)).collect()).find((s) => s.verdict === "pending"));
    expect(pending).toBeDefined();
    if (!pending) throw new Error("Missing demo proof");
    const getMember = async () => (await members(t, potId)).find((m) => m.userId === pending.userId);
    expect(await getMember()).toMatchObject({ completedDays: [1, 2, 3], streakCount: 3 });
    await t.mutation(api.demo.forceDemoSubmissionVerdict, { submissionId: pending._id, verdict: "passed" });
    expect(await getMember()).toMatchObject({ completedDays: [1, 2, 3, 4], streakCount: 4, lastSubmittedDayIndex: 4 });
    await t.mutation(api.demo.forceDemoSubmissionVerdict, { submissionId: pending._id, verdict: "failed_spoof" });
    expect(await t.run(async (ctx) => ctx.db.get(pending._id))).toMatchObject({ verdict: "failed_spoof", evaluationMode: "demo_override", spoofSignals: ["screen_glare", "low_motion"] });
    expect(await getMember()).toMatchObject({ completedDays: [1, 2, 3], streakCount: 3, lastSubmittedDayIndex: 3 });
    await t.mutation(api.demo.forceDemoSubmissionVerdict, { submissionId: pending._id, verdict: "passed" });
    expect(await getMember()).toMatchObject({ completedDays: [1, 2, 3, 4], streakCount: 4 });
  });
});
