import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const now = Date.UTC(2026, 0, 5, 6);
type Backend = TestConvex<typeof schema>;

async function user(t: Backend, handle: string) {
  return await t.run(async ctx => ctx.db.insert("users", { name: handle, handle, simulatedWalletBalanceCents: 0, createdAt: now }));
}

describe("pot invites", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  it("creates a custom-stake pot and pre-invites existing and placeholder friends once", async () => {
    const t = convexTest(schema, modules);
    const creator = await user(t, "creator");
    const friend = await user(t, "alice");
    const potId = await t.mutation(api.pots.createPot, {
      title: "Walk together", habitCategory: "custom", habitPrompt: "Walk", createdByUserId: creator,
      stakeCents: 2575, invitedHandles: [" @Alice ", "bob", "BOB"], invitedUserIds: [friend, friend],
    });
    const { pot, members, users } = await t.run(async ctx => ({
      pot: await ctx.db.get(potId), members: await ctx.db.query("memberships").collect(), users: await ctx.db.query("users").collect(),
    }));
    expect(pot).toMatchObject({ stakeCents: 2575, challengeMode: "sidequest", invitedHandles: ["alice", "bob"], potTotalCents: 0 });
    expect(pot?.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(users.filter(u => u.handle === "alice")).toHaveLength(1);
    const bob = users.find(u => u.handle === "bob");
    expect(bob).toMatchObject({ name: "bob", simulatedWalletBalanceCents: 0 });
    expect(members).toHaveLength(2);
    expect(members.map(m => m.userId)).toEqual(expect.arrayContaining([friend, bob?._id]));
    expect(members.every(m => m.stakeStatus === "pending_checkout")).toBe(true);
    expect(await t.mutation(api.pots.createOrGetFriend, { name: "Alice Cooper", handle: "@ALICE" })).toBe(friend);
    expect(await t.mutation(api.pots.createOrGetFriend, { name: "Bob", handle: "bob" })).toBe(bob?._id);
  });

  it("looks up and joins by code idempotently while charging the exact custom stake", async () => {
    const t = convexTest(schema, modules);
    const creator = await user(t, "creator");
    const friend = await user(t, "friend");
    const potId = await t.mutation(api.pots.createPot, { title: "Run", habitCategory: "fitness", habitPrompt: "Run", createdByUserId: creator, stakeCents: 1234, challengeMode: "habit_photo" });
    const pot = await t.run(async ctx => ctx.db.get(potId));
    const code = pot!.inviteCode!;
    const inviteUrl = `https://ante.app/join/${code}`;
    expect(await t.query(api.pots.getPotByInviteCode, { inviteCode: ` ${code.toLowerCase()} ` })).toMatchObject({ _id: potId, stakeCents: 1234, challengeMode: "habit_photo", inviteUrl });
    const joined = await t.mutation(api.pots.joinPotByInviteCode, { inviteCode: code, userId: friend });
    expect(joined).toMatchObject({ potId, inviteUrl, stakeCents: 1234 });
    expect(await t.mutation(api.pots.joinPotByInviteCode, { inviteCode: code, userId: friend })).toEqual(joined);
    await t.mutation(internal.pots.confirmWhopStake, { potId, userId: friend, whopPaymentId: "pay_custom", eventId: "event_custom", mode: "simulated" });
    expect(await t.run(async ctx => ctx.db.get(potId))).toMatchObject({ potTotalCents: 1234, status: "active" });
  });

  it("rejects bad stakes, unknown users and unavailable or invalid invites", async () => {
    const t = convexTest(schema, modules);
    const creator = await user(t, "creator");
    const friend = await user(t, "friend");
    const details = { title: "Walk", habitCategory: "fitness" as const, habitPrompt: "Walk", createdByUserId: creator };
    for (const stakeCents of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(t.mutation(api.pots.createPot, { ...details, stakeCents })).rejects.toThrow("Invalid pot details");
    }
    await expect(t.mutation(api.pots.createOrGetFriend, { name: "Name", handle: " @ " })).rejects.toThrow();
    await expect(t.mutation(api.pots.createPot, { ...details, invitedHandles: [" "] })).rejects.toThrow();
    expect(await t.query(api.pots.getPotByInviteCode, { inviteCode: "NOPE00" })).toBeNull();
    await expect(t.mutation(api.pots.joinPotByInviteCode, { inviteCode: "NOPE00", userId: friend })).rejects.toThrow("Invite code not found");
    const deleted = await user(t, "deleted");
    await t.run(async ctx => ctx.db.delete(deleted));
    await expect(t.mutation(api.pots.createPot, { ...details, invitedUserIds: [deleted] })).rejects.toThrow("Invited user not found");
    const potId = await t.mutation(api.pots.createPot, details);
    const pot = await t.run(async ctx => ctx.db.get(potId));
    await t.run(async ctx => ctx.db.patch(potId, { nextDeadlineAt: now }));
    await expect(t.mutation(api.pots.joinPotByInviteCode, { inviteCode: pot!.inviteCode!, userId: friend })).rejects.toThrow("Pot is not accepting members");
  });

  it("issues distinct invite codes across pots", async () => {
    const t = convexTest(schema, modules);
    const creator = await user(t, "creator");
    const details = { title: "Walk", habitCategory: "fitness" as const, habitPrompt: "Walk", createdByUserId: creator };
    const potIds = await Promise.all(Array.from({ length: 10 }, () => t.mutation(api.pots.createPot, details)));
    const pots = await t.run(async ctx => Promise.all(potIds.map(id => ctx.db.get(id))));
    expect(new Set(pots.map(pot => pot?.inviteCode)).size).toBe(pots.length);
  });
});
