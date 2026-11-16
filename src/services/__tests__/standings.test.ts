import { describe, expect, it } from "vitest";
import { passedMembers, payoutPreview, rankStandings } from "../standings";
import type { Member, Postcard } from "../types";

const m = (id: string): Member => ({ id, name: id, fullName: id, initials: id.slice(0, 2), tint: "#000" });
const members = [m("aahil"), m("sarah"), m("yusuf")];
const card = (memberId: string, minutesTaken: number) => ({ id: `${memberId}-${Math.random()}`, memberId, minutesTaken }) as Postcard;

describe("weekly standings", () => {
  it("ranks by sidequests completed, then by total minutes", () => {
    const standings = rankStandings(members, [card("sarah", 8), card("sarah", 9), card("aahil", 10), card("aahil", 12), card("yusuf", 5)]);
    expect(standings.map(s => [s.member.id, s.rank])).toEqual([["sarah", 1], ["aahil", 2], ["yusuf", 3]]);
  });

  it("names who you passed", () => {
    const before = rankStandings(members, [card("sarah", 8), card("sarah", 9), card("aahil", 10), card("aahil", 12)]);
    const after = rankStandings(members, [card("sarah", 8), card("sarah", 9), card("aahil", 10), card("aahil", 12), card("aahil", 11)]);
    expect(passedMembers(before, after, "aahil").map(x => x.id)).toEqual(["sarah"]);
    expect(passedMembers(after, after, "aahil")).toEqual([]);
  });

  it("splits the pot between tied leaders", () => {
    const standings = rankStandings(members, [card("sarah", 8), card("aahil", 10)]);
    expect(payoutPreview(standings, 12_000, "aahil")).toEqual({ leading: true, shareCents: 6000, leaders: 2 });
    expect(payoutPreview(standings, 12_000, "yusuf").leading).toBe(false);
  });
});
